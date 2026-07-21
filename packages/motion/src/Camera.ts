import { Effect } from "effect";
import * as Duration from "effect/Duration";
import * as Function from "effect/Function";
import * as Motion from "./Motion.js";
import type * as Projection from "./Projection.js";
import * as Runner from "./Runner.js";
import * as Scene from "./Scene.js";
import * as S from "./schemas.js";
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
 * A helper target: an Instance (position read live each frame), an Effect
 * resolving to one (resolved once at helper start, then read live), or a
 * plain position (inherently fixed — the no-entity escape hatch).
 */
export type CameraTarget =
	| S.Instance
	| Effect.Effect<S.Instance, never, Runner.Runner>
	| Partial<Motion.Position>;

// R defaults to Runner so helper outputs pipe straight into helper inputs
type CamOrEffect<E = never, R = Runner.Runner> = S.InstanceOrEffect<
	"Camera",
	E,
	R
>;
type CamInstance = S.Instance<"Camera">;
type CamEffect = Effect.Effect<CamInstance, never, Runner.Runner>;

// a target argument (vs a duration/timing in the same slot): instances,
// effects, or a position-like object — Durations are objects too, so
// exclude them explicitly
const isTargetArg = (v: unknown): boolean =>
	S.isInstance(v) ||
	Effect.isEffect(v) ||
	(typeof v === "object" &&
		v !== null &&
		!Duration.isDuration(v) &&
		("x" in v || "y" in v || "z" in v));

// data-first iff the first arg is an instance AND the second is a target —
// plain firstArgIsInstance would misread `cam.pipe`-less pipeable calls
// whose TARGET is an instance (`lookAt(hero, "1 second")`)
const dataFirst = (args: IArguments) =>
	S.isInstance(args[0]) && isTargetArg(args[1]);

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
	if (S.isInstance(target) || Effect.isEffect(target)) {
		const instance = yield* S.flattenInstance(
			target as S.InstanceOrEffect<S.EntityTag, never, Runner.Runner>,
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
type CameraShape = S.EntityByTag<"Camera">;

const setPoi = (data: CameraShape, p: Motion.Position): CameraShape => ({
	...data,
	poi: S.vec3(p),
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
	const cam = yield* S.flattenInstance(camOrEffect);
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
 * Aim the camera at a target. No duration: set the point of interest this
 * frame. With a duration: eased re-aim as a retargeted tween (lands
 * exactly on a moving target, no terminal snap). `offset` shifts the aim
 * relative to the target ("slightly above their head"). Dual:
 * `lookAt(cam, target, ...)` or `cam.pipe(lookAt(target, ...))`.
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
 * Track a target for the duration: the point of interest is a hard
 * per-frame copy of the target position (+offset). A plain animator — it
 * pipes, `Scene.all`s, staggers, repeats. No timing input (lag is
 * expressed by springing the POI instead). Ordering practice: within a
 * tick, branches run in fork order — a follow forked before its target's
 * animator reads the previous frame's position, a deterministic one-frame
 * trail. Dual like `lookAt`.
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
		const cam = yield* S.flattenInstance(camOrEffect);
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
	const cam = yield* S.flattenInstance(camOrEffect);
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
			position: S.vec3({
				x: p.x + radius * Math.sin(angle) - origin.x,
				y: d.position.y,
				z: p.z + radius * Math.cos(angle),
			}),
		};
	});
});

/**
 * Turntable the camera to an absolute azimuth around its point of
 * interest (angle about the world-Y axis through the POI; 0 = directly +z
 * of it). Position travels the arc — orientation comes entirely from the
 * POI, so there is no orientation math to get wrong. Radius and height
 * are preserved. Dies loudly without a POI. Dual like `moveTo`.
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
>((args) => S.isInstance(args[0]), ((
	cam: CamOrEffect,
	azimuth: number,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) => orbitImpl(cam, undefined, azimuth, duration, timing)) as never);

/** Like `orbitTo`, but from an explicit start azimuth. */
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
>((args) => S.isInstance(args[0]), orbitImpl as never);

const dollyImpl = Effect.fnUntraced(function* (
	camOrEffect: CamOrEffect,
	from: number | undefined,
	to: number,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) {
	const cam = yield* S.flattenInstance(camOrEffect);
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
			position: S.vec3({
				x: p.x + u.x * dist - origin.x,
				y: p.y + u.y * dist - origin.y,
				z: p.z + u.z * dist,
			}),
		};
	});
});

/**
 * Move the camera along its view axis to an absolute distance from the
 * point of interest (in: toward it, out: away), aim unchanged. Dies
 * loudly without a POI. Dual like `moveTo`.
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
>((args) => S.isInstance(args[0]), ((
	cam: CamOrEffect,
	distance: number,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) => dollyImpl(cam, undefined, distance, duration, timing)) as never);

/** Like `dollyTo`, but from an explicit start distance. */
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
>((args) => S.isInstance(args[0]), dollyImpl as never);
