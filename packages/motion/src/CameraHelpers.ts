import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import type { Camera } from "./Camera.js";
import * as Entity from "./Entity.js";
import * as Instance from "./Instance.js";
import * as Motion from "./Motion.js";
import * as Runner from "./Runner.js";
import * as Scene from "./Scene.js";
import * as Time from "./Time.js";
import * as Timing from "./Timing.js";

export type { CameraState } from "./Camera.js";
/**
 * The public Camera surface: the entity/identity from Camera.js plus the
 * directing helpers. This module (not Camera.ts) is what index exports as
 * the `Camera` namespace — Runner/Renderer import the schema file
 * directly, so helpers can depend on Motion/Scene without an import
 * cycle.
 *
 * Naming rule (recorded in the camera-poi-helpers change): verbs that
 * name their target (`lookAt`, `follow`) have no base/To pair — an
 * optional duration selects instant vs eased. Value-animating helpers
 * (`orbit`/`orbitTo`, `dolly`/`dollyTo`) keep the pair, exactly like
 * `move`/`moveTo`.
 */
// explicit named re-exports (not `export *`) so the public Camera surface
// is enumerable at a glance: the entity + identity from the schema module,
// plus the helpers below
export { Camera, identity } from "./Camera.js";

type AnyInstance = Instance.Instance<any, any, any>;

/**
 * A helper target: an Instance (position read live each frame), an Effect
 * resolving to one (resolved once at helper start, then read live), or a
 * plain position (inherently fixed — the no-entity escape hatch).
 */
export type CameraTarget =
	| AnyInstance
	| Effect.Effect<AnyInstance, never, Runner.Runner>
	| Partial<Entity.Position>;

type CamData = (typeof Camera)["data"];
type CamTraits = (typeof Camera)["traits"];
// R defaults to Runner so helper outputs pipe straight into helper inputs
type CamOrEffect<E = never, R = Runner.Runner> = Instance.InstanceOrEffect<
	"Camera",
	CamData,
	CamTraits,
	E,
	R
>;
type CamInstance = Instance.Instance<"Camera", CamData, CamTraits>;
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
	offset: Partial<Entity.Position> | undefined,
) {
	const ox = offset?.x ?? 0;
	const oy = offset?.y ?? 0;
	const oz = offset?.z ?? 0;
	if (Instance.isInstance(target) || Effect.isEffect(target)) {
		const instance = yield* Instance.flatten(
			target as Instance.InstanceOrEffect<
				string,
				any,
				any,
				never,
				Runner.Runner
			>,
		);
		const lens = Entity.traitOrDie<unknown, Entity.Position>(
			instance.entity,
			"~position",
		);
		return Scene.data(instance).pipe(
			Effect.map((data) => {
				const p = lens.get(data);
				return { x: p.x + ox, y: p.y + oy, z: p.z + oz };
			}),
		);
	}
	// AnyInstance's `any` params defeat narrowing — the guards above
	// returned for instances/effects, so this is a plain position
	const point = target as Partial<Entity.Position>;
	const fixed: Entity.Position = {
		x: (point.x ?? 0) + ox,
		y: (point.y ?? 0) + oy,
		z: (point.z ?? 0) + oz,
	};
	return Effect.succeed(fixed);
});

type CameraShape = {
	x: number;
	y: number;
	z?: number;
	poiX?: number;
	poiY?: number;
	poiZ?: number;
};

const setPoi = (data: object, p: Entity.Position) =>
	Object.assign({}, data, { poiX: p.x, poiY: p.y, poiZ: p.z });

// the camera's WORLD position: x/y are pan-from-viewport-center
const worldPosition = Effect.fnUntraced(function* (cam: CamInstance) {
	const { comp } = yield* Runner.Runner;
	const data = (yield* Scene.data(cam)) as CameraShape;
	return {
		x: comp.width / 2 + data.x,
		y: comp.height / 2 + data.y,
		z: data.z ?? 0,
	};
});

const lookAtImpl = Effect.fnUntraced(function* (
	camOrEffect: CamOrEffect,
	target: CameraTarget,
	duration?: Duration.Input,
	timing?: Timing.TimingInput,
	offset?: Partial<Entity.Position>,
) {
	const cam = yield* Instance.flatten(camOrEffect);
	const read = yield* targetReader(target, offset);
	if (duration === undefined) {
		const p = yield* read;
		yield* Scene.update(cam, (d) => setPoi(d as object, p) as typeof d);
		return cam;
	}
	// eased re-aim: a RETARGETED tween — each frame interpolates from the
	// start POI toward the target's CURRENT position, converging exactly
	// onto a moving target at t = 1 (a plain-Position target degenerates to
	// a fixed tween). Effectful per-frame read, so this runs its own loop
	// rather than Motion.drive (whose callback is pure).
	const runner = yield* Runner.Runner;
	const timingFn = Timing.resolve(timing ?? "linear");
	const data = (yield* Scene.data(cam)) as CameraShape;
	let start: Entity.Position;
	if (
		data.poiX !== undefined &&
		data.poiY !== undefined &&
		data.poiZ !== undefined
	) {
		start = { x: data.poiX, y: data.poiY, z: data.poiZ };
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
		yield* Scene.update(
			cam,
			(d) =>
				setPoi(d as object, {
					x: start.x + (p.x - start.x) * t,
					y: start.y + (p.y - start.y) * t,
					z: start.z + (p.z - start.z) * t,
				}) as typeof d,
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
export const lookAt = dual<
	(
		target: CameraTarget,
		duration?: Duration.Input,
		timing?: Timing.TimingInput,
		offset?: Partial<Entity.Position>,
	) => (cam: CamOrEffect) => CamEffect,
	(
		cam: CamOrEffect,
		target: CameraTarget,
		duration?: Duration.Input,
		timing?: Timing.TimingInput,
		offset?: Partial<Entity.Position>,
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
export const follow = dual<
	(
		target: CameraTarget,
		duration: Duration.Input,
		offset?: Partial<Entity.Position>,
	) => (cam: CamOrEffect) => CamEffect,
	(
		cam: CamOrEffect,
		target: CameraTarget,
		duration: Duration.Input,
		offset?: Partial<Entity.Position>,
	) => CamEffect
>(
	dataFirst,
	Effect.fnUntraced(function* (
		camOrEffect: CamOrEffect,
		target: CameraTarget,
		duration: Duration.Input,
		offset?: Partial<Entity.Position>,
	) {
		const cam = yield* Instance.flatten(camOrEffect);
		const read = yield* targetReader(target, offset);
		const runner = yield* Runner.Runner;
		const frames = Math.max(
			1,
			Time.toFrames(duration, runner.settings.frameRate),
		);
		for (let i = 1; i <= frames; i++) {
			const p = yield* read;
			yield* Scene.update(cam, (d) => setPoi(d as object, p) as typeof d);
			yield* Scene.tick;
		}
		return cam;
	}) as never,
);

// orbit/dolly are defined relative to the POI — die loudly without one
const poiOrDie = (data: CameraShape): Entity.Position => {
	if (
		data.poiX === undefined ||
		data.poiY === undefined ||
		data.poiZ === undefined
	) {
		throw new Error(
			"Camera: orbit/dolly need a point of interest — set one first (Camera.lookAt(target))",
		);
	}
	return { x: data.poiX, y: data.poiY, z: data.poiZ };
};

const orbitImpl = Effect.fnUntraced(function* (
	camOrEffect: CamOrEffect,
	from: number | undefined,
	to: number,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) {
	const cam = yield* Instance.flatten(camOrEffect);
	const { comp } = yield* Runner.Runner;
	const origin = { x: comp.width / 2, y: comp.height / 2 };
	const startData = (yield* Scene.data(cam)) as CameraShape;
	const poi = poiOrDie(startData);
	const world = {
		x: origin.x + startData.x,
		z: startData.z ?? 0,
	};
	// azimuth 0 = directly +z of the POI (the resting side); radius = the
	// current horizontal distance, preserved through the arc; height too
	const radius = Math.hypot(world.x - poi.x, world.z - poi.z);
	const startAzimuth = from ?? Math.atan2(world.x - poi.x, world.z - poi.z);
	return yield* Motion.drive(cam, duration, timing ?? "linear", (t, d) => {
		const data = d as CameraShape;
		// POI read from live data: orbiting a moving POI stays centered on it
		const p = poiOrDie(data);
		const angle = startAzimuth + (to - startAzimuth) * t;
		return Object.assign({}, d, {
			x: p.x + radius * Math.sin(angle) - origin.x,
			z: p.z + radius * Math.cos(angle),
		}) as typeof d;
	});
});

/**
 * Turntable the camera to an absolute azimuth around its point of
 * interest (angle about the world-Y axis through the POI; 0 = directly +z
 * of it). Position travels the arc — orientation comes entirely from the
 * POI, so there is no orientation math to get wrong. Radius and height
 * are preserved. Dies loudly without a POI. Dual like `moveTo`.
 */
export const orbitTo = dual<
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

/** Like `orbitTo`, but from an explicit start azimuth. */
export const orbit = dual<
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
	const cam = yield* Instance.flatten(camOrEffect);
	const { comp } = yield* Runner.Runner;
	const origin = { x: comp.width / 2, y: comp.height / 2 };
	const startData = (yield* Scene.data(cam)) as CameraShape;
	const poi = poiOrDie(startData);
	const world = {
		x: origin.x + startData.x,
		y: origin.y + startData.y,
		z: startData.z ?? 0,
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
		const data = d as CameraShape;
		const p = poiOrDie(data);
		const dist = d0 + (to - d0) * t;
		return Object.assign({}, d, {
			x: p.x + u.x * dist - origin.x,
			y: p.y + u.y * dist - origin.y,
			z: p.z + u.z * dist,
		}) as typeof d;
	});
});

/**
 * Move the camera along its view axis to an absolute distance from the
 * point of interest (in: toward it, out: away), aim unchanged. Dies
 * loudly without a POI. Dual like `moveTo`.
 */
export const dollyTo = dual<
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

/** Like `dollyTo`, but from an explicit start distance. */
export const dolly = dual<
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
