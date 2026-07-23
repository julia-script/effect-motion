import { Effect } from "effect";
import * as Duration from "effect/Duration";
import * as Function from "effect/Function";
import * as Entity from "./Entity.js";
import * as Instance from "./Instance.js";
import * as Motion from "./Motion.js";
import type * as Projection from "./Projection.js";
import * as Runner from "./Runner.js";
import * as Scene from "./Scene.js";
import * as Time from "./Time.js";
import * as Timing from "./Timing.js";

/**
 * The camera is view state, not a shape — it is never registered with a sink
 * and never drawn. It exists as an ordinary Instance so the existing
 * animators drive it for free: `camera.pipe(moveTo({ z: -800 }))`,
 * `tween("rotY", ...)`, `spring`, `Scene.fork`, etc.
 *
 * `position` is the camera's world position, `rotation` its Euler
 * orientation, and `focalLength` sets the field of view. At rest
 * the camera sits a focal-length back on +z looking down world -z, so a
 * world point at z=0 projects to plain-2D screen coordinates — see
 * `Projection.ts`. The sink reads these off `FrameMeta.camera` and projects
 * every instance through them; instance data stays in world coordinates, so
 * determinism and `moveTo` semantics are untouched by the camera.
 *
 * `z` and `focalLength` have no static schema default: the right resting
 * values are width-relative (After Effects' 50mm-equivalent — see
 * `Projection.defaultFocalLength`), and only the Runner knows the scene
 * width. The Runner fills both at instantiate time for every Camera
 * instance, so by the time animators or the renderer read the data they are
 * always concrete.
 */
/** the camera view as a frame carries it */
export type CameraState = Projection.CameraView & Projection.PointOfInterest;

/**
 * What the camera helpers accept as something to aim at.
 *
 * @remarks
 * An instance is read LIVE each frame, so aiming tracks it as it moves — the
 * usual case. A plain position is fixed, for aiming at a spot where no
 * entity exists.
 */
export type CameraTarget =
	| Instance.Instance
	| Effect.Effect<Instance.Instance, never, Runner.Runner>
	| Partial<Motion.Position>;

// R defaults to Runner so helper outputs pipe straight into helper inputs
type CamOrEffect<E = never, R = Runner.Runner> = Instance.InstanceOrEffect<
	"Camera",
	E,
	R
>;
type CamInstance = Instance.Instance<"Camera">;
type CamEffect = Effect.Effect<CamInstance, never, Runner.Runner>;

// a target argument (vs a duration/timing in the same slot): instances,
// effects, or a position-like object — Durations are objects too, so
// exclude them explicitly
const isTargetArg = (v: unknown): boolean =>
	Instance.isInstance(v) ||
	Effect.isEffect(v) ||
	(typeof v === "object" &&
		v !== null &&
		!Duration.isDuration(v) &&
		("x" in v || "y" in v || "z" in v));

// data-first iff the first arg is an instance AND the second is a target —
// plain firstArgIsInstance would misread `cam.pipe`-less pipeable calls
// whose TARGET is an instance (`lookAt(hero, "1 second")`)
const dataFirst = (args: IArguments) =>
	Instance.isInstance(args[0]) && isTargetArg(args[1]);

/**
 * Resolve a target once (Effects yield their Instance), returning a
 * per-frame position reader with the offset folded in: live for
 * instances, fixed for plain positions.
 */
const targetReader = Effect.fnUntraced(function* (
	target: CameraTarget,
	offset: Partial<Motion.Position> | undefined,
) {
	const ox = offset?.x ?? 0;
	const oy = offset?.y ?? 0;
	const oz = offset?.z ?? 0;
	if (Instance.isInstance(target) || Effect.isEffect(target)) {
		const instance = yield* Instance.flattenInstance(
			target as Instance.InstanceOrEffect<
				Entity.EntityTag,
				never,
				Runner.Runner
			>,
		);
		return Scene.data(instance).pipe(
			Effect.map((data) => {
				const p = data.position;
				return { x: p.x + ox, y: p.y + oy, z: p.z + oz };
			}),
		);
	}
	// AnyInstance's `any` params defeat narrowing — the guards above
	// returned for instances/effects, so this is a plain position
	const point = target as Partial<Motion.Position>;
	const fixed: Motion.Position = {
		x: (point.x ?? 0) + ox,
		y: (point.y ?? 0) + oy,
		z: (point.z ?? 0) + oz,
	};
	return Effect.succeed(fixed);
});

// the camera's own data, straight from the union — CameraShape (a
// hand-written duplicate this module cast to at six sites) is gone with the
// open world that made it necessary
type CameraShape = Entity.EntityByTag<"Camera">;

const setPoi = (data: CameraShape, p: Motion.Position): CameraShape => ({
	...data,
	poi: Entity.vec3(p),
});

// the camera's WORLD position: x/y are pan-from-viewport-center
const worldPosition = Effect.fnUntraced(function* (cam: CamInstance) {
	const { comp } = yield* Runner.Runner;
	const data = yield* Scene.data(cam);
	return {
		x: comp.width / 2 + data.position.x,
		y: comp.height / 2 + data.position.y,
		z: data.position.z,
	};
});

const lookAtImpl = Effect.fnUntraced(function* (
	camOrEffect: CamOrEffect,
	target: CameraTarget,
	duration?: Duration.Input,
	timing?: Timing.TimingInput,
	offset?: Partial<Motion.Position>,
) {
	const cam = yield* Instance.flattenInstance(camOrEffect);
	const read = yield* targetReader(target, offset);
	if (duration === undefined) {
		const p = yield* read;
		yield* Scene.update(cam, (d) => setPoi(d, p));
		return cam;
	}
	// eased re-aim: a RETARGETED tween — each frame interpolates from the
	// start POI toward the target's CURRENT position, converging exactly
	// onto a moving target at t = 1 (a plain-Position target degenerates to
	// a fixed tween). Effectful per-frame read, so this runs its own loop
	// rather than Motion.drive (whose callback is pure).
	const runner = yield* Runner.Runner;
	const timingFn = Timing.resolve(timing ?? "linear");
	const data = yield* Scene.data(cam);
	let start: Motion.Position;
	if (data.poi !== null) {
		start = data.poi;
	} else {
		// no POI yet: seed on the camera's UNAIMED axis (straight down world
		// -z) at the target's distance. resolveCamera derives zero aim for
		// that point, so the explicit Euler alone carries the view — engaging
		// POI mode is snap-free for ANY current orientation, and the tween
		// takes over from there.
		const world = yield* worldPosition(cam);
		const first = yield* read;
		const distance = Math.hypot(
			first.x - world.x,
			first.y - world.y,
			first.z - world.z,
		);
		start = { x: world.x, y: world.y, z: world.z - distance };
	}
	const frames = Math.max(
		1,
		Time.toFrames(duration, runner.settings.frameRate),
	);
	for (let i = 1; i <= frames; i++) {
		const t = timingFn(i / frames);
		const p = yield* read;
		yield* Scene.update(cam, (d) =>
			setPoi(d, {
				x: start.x + (p.x - start.x) * t,
				y: start.y + (p.y - start.y) * t,
				z: start.z + (p.z - start.z) * t,
			}),
		);
		yield* Scene.tick;
	}
	return cam;
});

/**
 * Point the camera at something.
 *
 * @remarks
 * Aiming is expressed as a point of interest rather than as rotation
 * angles, which is what makes it composable: the target can be a live
 * instance, and the camera keeps facing it as it moves. There is no
 * `lookAtTo` — the verb already names its target — so an optional
 * `duration` selects between the two behaviors:
 *
 * - **Omitted** — aim snaps this frame. Use it to establish the shot before
 *   anything moves.
 * - **Given** — the aim eases over that time as a RETARGETED tween: each
 *   frame interpolates toward the target's current position, so it converges
 *   exactly onto a moving target with no snap at the end.
 *
 * Setting a point of interest is also the prerequisite for
 * {@link orbitTo} and {@link dollyTo}, which are both defined relative to it.
 *
 * @param target - An instance to track, or a fixed world position.
 * @param duration - Omit to snap; give a time to ease the re-aim.
 * @param timing - An easing name or function.
 * @param offset - Shifts the aim relative to the target, e.g. slightly above.
 * @defaultValue `timing` — `"linear"`
 * @returns The camera, so animators chain.
 *
 * @example
 * Snap to establish, then ease across to a second subject.
 * ```typescript
 * const camera = yield* Scene.camera;
 * yield* camera.pipe(Camera.lookAt(hero));
 * yield* camera.pipe(Camera.lookAt(villain, "1 second", "easeInOutCubic"));
 * ```
 */
export const lookAt = Function.dual<
	(
		target: CameraTarget,
		duration?: Duration.Input,
		timing?: Timing.TimingInput,
		offset?: Partial<Motion.Position>,
	) => (cam: CamOrEffect) => CamEffect,
	(
		cam: CamOrEffect,
		target: CameraTarget,
		duration?: Duration.Input,
		timing?: Timing.TimingInput,
		offset?: Partial<Motion.Position>,
	) => CamEffect
>(dataFirst, lookAtImpl as never);

/**
 * Keep the camera locked onto a moving target for `duration`.
 *
 * @remarks
 * Where {@link lookAt} with a duration EASES toward a target and stops,
 * `follow` holds the aim on it: every frame copies the target's position, so
 * the subject stays pinned while it moves. Run it concurrently with the
 * subject's own animation — typically inside `Scene.all` or a `Scene.fork`.
 *
 * There is no timing parameter, because tracking is a hard per-frame copy
 * rather than an interpolation. For a lagging, weighted camera, animate the
 * point of interest with a spring instead.
 *
 * Ordering note: within a frame, branches run in the order they were forked.
 * A follow forked BEFORE its target's animator reads the previous frame's
 * position — a deterministic one-frame trail, not a bug.
 *
 * @param target - An instance to track, or a fixed world position.
 * @param duration - How long to keep tracking.
 * @param offset - Shifts the aim relative to the target.
 * @returns The camera, so animators chain.
 *
 * @example
 * Track the runner for the two seconds it is crossing frame.
 * ```typescript
 * yield* Scene.all([
 * 	runner.pipe(Motion.moveTo({ x: 900 }, "2 seconds")),
 * 	camera.pipe(Camera.follow(runner, "2 seconds")),
 * ]);
 * ```
 */
export const follow = Function.dual<
	(
		target: CameraTarget,
		duration: Duration.Input,
		offset?: Partial<Motion.Position>,
	) => (cam: CamOrEffect) => CamEffect,
	(
		cam: CamOrEffect,
		target: CameraTarget,
		duration: Duration.Input,
		offset?: Partial<Motion.Position>,
	) => CamEffect
>(
	dataFirst,
	Effect.fnUntraced(function* (
		camOrEffect: CamOrEffect,
		target: CameraTarget,
		duration: Duration.Input,
		offset?: Partial<Motion.Position>,
	) {
		const cam = yield* Instance.flattenInstance(camOrEffect);
		const read = yield* targetReader(target, offset);
		const runner = yield* Runner.Runner;
		const frames = Math.max(
			1,
			Time.toFrames(duration, runner.settings.frameRate),
		);
		for (let i = 1; i <= frames; i++) {
			const p = yield* read;
			yield* Scene.update(cam, (d) => setPoi(d, p));
			yield* Scene.tick;
		}
		return cam;
	}) as never,
);

// orbit/dolly are defined relative to the POI — die loudly without one
const poiOrDie = (data: CameraShape): Motion.Position => {
	if (data.poi === null) {
		throw new Error(
			"Camera: orbit/dolly need a point of interest — set one first (Camera.lookAt(target))",
		);
	}
	return data.poi;
};

const orbitImpl = Effect.fnUntraced(function* (
	camOrEffect: CamOrEffect,
	from: number | undefined,
	to: number,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) {
	const cam = yield* Instance.flattenInstance(camOrEffect);
	const { comp } = yield* Runner.Runner;
	const origin = { x: comp.width / 2, y: comp.height / 2 };
	const startData = yield* Scene.data(cam);
	const poi = poiOrDie(startData);
	const world = {
		x: origin.x + startData.position.x,
		z: startData.position.z,
	};
	// azimuth 0 = directly +z of the POI (the resting side); radius = the
	// current horizontal distance, preserved through the arc; height too
	const radius = Math.hypot(world.x - poi.x, world.z - poi.z);
	const startAzimuth = from ?? Math.atan2(world.x - poi.x, world.z - poi.z);
	return yield* Motion.drive(cam, duration, timing ?? "linear", (t, d) => {
		const data = d;
		// POI read from live data: orbiting a moving POI stays centered on it
		const p = poiOrDie(data);
		const angle = startAzimuth + (to - startAzimuth) * t;
		return {
			...d,
			position: Entity.vec3({
				x: p.x + radius * Math.sin(angle) - origin.x,
				y: d.position.y,
				z: p.z + radius * Math.cos(angle),
			}),
		};
	});
});

/**
 * Swing the camera around its point of interest, like a turntable.
 *
 * @remarks
 * The camera travels an arc at a fixed radius and height while continuing to
 * face the subject — the standard "orbit the product" move. Only the
 * position is animated; the aim follows from the point of interest, so there
 * is no orientation math to get wrong.
 *
 * `azimuth` is an ABSOLUTE angle in radians about the world-Y axis through
 * the point of interest, where 0 is directly in front (+z of it). A full
 * turn is `Math.PI * 2`; the sign chooses direction.
 *
 * Requires a point of interest — call {@link lookAt} first, or this fails
 * loudly telling you so.
 *
 * @param azimuth - Target angle in radians; 0 is directly in front.
 * @param duration - How long, in scene time.
 * @param timing - An easing name or function.
 * @defaultValue `timing` — `"linear"`
 * @returns The camera, so animators chain.
 * @see {@link orbit} to start from an explicit angle.
 *
 * @example
 * A quarter turn around a subject.
 * ```typescript
 * yield* camera.pipe(
 * 	Camera.lookAt(subject),
 * 	Camera.orbitTo(Math.PI / 2, "2 seconds", "easeInOutCubic"),
 * );
 * ```
 */
export const orbitTo = Function.dual<
	(
		azimuth: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => (cam: CamOrEffect) => CamEffect,
	(
		cam: CamOrEffect,
		azimuth: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => CamEffect
>((args) => Instance.isInstance(args[0]), ((
	cam: CamOrEffect,
	azimuth: number,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) => orbitImpl(cam, undefined, azimuth, duration, timing)) as never);

/**
 * Like {@link orbitTo}, but starting from an explicit azimuth.
 *
 * @remarks
 * Stating both ends is what makes a full revolution expressible: `orbit(0,
 * Math.PI * 2, …)` sweeps all the way around, whereas `orbitTo(Math.PI * 2)`
 * from a resting camera would already be at its target and not move.
 *
 * @param from - Starting angle in radians.
 * @param to - Target angle in radians.
 * @param duration - How long, in scene time.
 * @param timing - An easing name or function.
 * @returns The camera, so animators chain.
 *
 * @example
 * One full revolution.
 * ```typescript
 * yield* camera.pipe(Camera.orbit(0, Math.PI * 2, "4 seconds"));
 * ```
 */
export const orbit = Function.dual<
	(
		from: number,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => (cam: CamOrEffect) => CamEffect,
	(
		cam: CamOrEffect,
		from: number,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => CamEffect
>((args) => Instance.isInstance(args[0]), orbitImpl as never);

const dollyImpl = Effect.fnUntraced(function* (
	camOrEffect: CamOrEffect,
	from: number | undefined,
	to: number,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) {
	const cam = yield* Instance.flattenInstance(camOrEffect);
	const { comp } = yield* Runner.Runner;
	const origin = { x: comp.width / 2, y: comp.height / 2 };
	const startData = yield* Scene.data(cam);
	const poi = poiOrDie(startData);
	const world = {
		x: origin.x + startData.position.x,
		y: origin.y + startData.position.y,
		z: startData.position.z,
	};
	const startDistance = Math.hypot(
		world.x - poi.x,
		world.y - poi.y,
		world.z - poi.z,
	);
	// the fixed unit direction POI → camera; a zero distance has no
	// direction to dolly along
	if (startDistance === 0) {
		throw new Error(
			"Camera: dolly from distance 0 — the camera sits ON its point of interest, so there is no view axis to move along",
		);
	}
	const u = {
		x: (world.x - poi.x) / startDistance,
		y: (world.y - poi.y) / startDistance,
		z: (world.z - poi.z) / startDistance,
	};
	const d0 = from ?? startDistance;
	return yield* Motion.drive(cam, duration, timing ?? "linear", (t, d) => {
		const data = d;
		const p = poiOrDie(data);
		const dist = d0 + (to - d0) * t;
		return {
			...d,
			position: Entity.vec3({
				x: p.x + u.x * dist - origin.x,
				y: p.y + u.y * dist - origin.y,
				z: p.z + u.z * dist,
			}),
		};
	});
});

/**
 * Move the camera toward or away from its point of interest along the view
 * axis.
 *
 * @remarks
 * A push-in or pull-back that keeps the subject centered and the aim
 * unchanged — only the distance changes. Distinct from tweening the camera's
 * `z`, which moves along the WORLD axis and would slide the subject off
 * center once the camera is aimed obliquely.
 *
 * Requires a point of interest — call {@link lookAt} first.
 *
 * @param distance - Target distance from the point of interest; smaller is
 *   closer.
 * @param duration - How long, in scene time.
 * @param timing - An easing name or function.
 * @defaultValue `timing` — `"linear"`
 * @returns The camera, so animators chain.
 * @see {@link dolly} to start from an explicit distance.
 *
 * @example
 * Push in on a subject.
 * ```typescript
 * yield* camera.pipe(
 * 	Camera.lookAt(subject),
 * 	Camera.dollyTo(300, "1500 millis", "easeInOutCubic"),
 * );
 * ```
 */
export const dollyTo = Function.dual<
	(
		distance: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => (cam: CamOrEffect) => CamEffect,
	(
		cam: CamOrEffect,
		distance: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => CamEffect
>((args) => Instance.isInstance(args[0]), ((
	cam: CamOrEffect,
	distance: number,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) => dollyImpl(cam, undefined, distance, duration, timing)) as never);

/**
 * Like {@link dollyTo}, but starting from an explicit distance.
 *
 * @remarks
 * For a push-in that begins further out than the camera currently sits —
 * the move starts at `from` regardless of where the camera was left.
 *
 * @param from - Starting distance from the point of interest.
 * @param to - Target distance.
 * @param duration - How long, in scene time.
 * @param timing - An easing name or function.
 * @returns The camera, so animators chain.
 */
export const dolly = Function.dual<
	(
		from: number,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => (cam: CamOrEffect) => CamEffect,
	(
		cam: CamOrEffect,
		from: number,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => CamEffect
>((args) => Instance.isInstance(args[0]), dollyImpl as never);
