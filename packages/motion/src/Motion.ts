import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Effectable from "effect/Effectable";
import { dual } from "effect/Function";
import * as Color from "./Color.js";
import * as Entity from "./Entity.js";
import * as Instance from "./Instance.js";
import * as Runner from "./Runner.js";
import * as Scene from "./Scene.js";
import * as Time from "./Time.js";
import * as Timing from "./Timing.js";

export const color = (to: Color.Color, mode: Color.InterpolationMode) => {
	return (from: Color.Color, t: number) => Color.mix(from, to, t, mode);
};
type ColorInterpolator = (from: Color.Color, t: number) => Color.Color;
export type InterpolableValue = number | Color.Color;

// optional numeric fields (schema optionalKey, e.g. the camera's
// z/focalLength) are tweenable too — strip undefined before matching
type InterpolableKeys<T> = {
	[K in keyof T]-?: NonNullable<T[K]> extends InterpolableValue ? K : never;
}[keyof T];

export type InterpolableOnly<T> = Pick<T, InterpolableKeys<T>>;
type InterpolableOrInterpolator<T> = {
	[K in keyof T]-?: NonNullable<T[K]> extends number
		? number
		: NonNullable<T[K]> extends Color.Color
			? Color.Color | ColorInterpolator
			: never;
};

// extrapolating on purpose: eased t goes outside [0, 1] for back/elastic
const lerpNumber = (from: number, to: number, t: number) =>
	from + (to - from) * t;

const lerpColor = (
	from: Color.Color,
	to: Color.Color,
	t: number,
	mode: Color.InterpolationMode,
) => {
	return Color.mix(from, to, t, mode);
};

/**
 * The interpolation engine: from `from` to `to` over `duration`, calling
 * `fn` with the eased value once per frame (each step ends in a
 * Scene.tick). The last call receives exactly `to` for any timing with
 * f(1) = 1; a zero-length duration still takes one frame. Internal —
 * public animators apply to instances.
 */
const interpolate = Effect.fnUntraced(function* <
	T extends Record<string, InterpolableValue>,
	A,
	E,
	R,
>(
	from: T,
	to: T,
	duration: Duration.Input,
	fn: (value: T) => Effect.Effect<A, E, R>,
	timing: Timing.TimingInput = "linear",
) {
	const runner = yield* Runner.Runner;
	const timingFn = Timing.resolve(timing);
	const keys = Object.keys(from);
	const frames = Math.max(
		1,
		Time.toFrames(duration, runner.settings.frameRate),
	);
	for (let i = 1; i <= frames; i++) {
		const t = timingFn(i / frames);
		const value: Record<string, InterpolableValue | ColorInterpolator> = {};
		for (const key of keys) {
			const fromValue = from[key];
			const toValue = to[key];
			if (typeof toValue === "number") {
				value[key] = lerpNumber(from[key] as number, to[key] as number, t);
			} else if (typeof toValue === "function") {
				const interpolator = toValue as ColorInterpolator;
				value[key] = interpolator(fromValue as Color.Color, t);
			} else {
				value[key] = lerpColor(
					fromValue as Color.Color,
					toValue as Color.Color,
					t,
					"lab",
				);
			}
		}
		yield* fn(value as T);
		yield* Scene.tick;
	}
});

/** target props, or an updater computing them from the current data */
export type Target<Tag extends Entity.EntityTag> =
	| Partial<InterpolableOrInterpolator<Entity.EntityByTag<Tag>>>
	| ((
			data: Entity.EntityByTag<Tag>,
	  ) => Partial<InterpolableOrInterpolator<Entity.EntityByTag<Tag>>>);

// InterpolableOnly of an opaque Entity.EntityByTag<Tag> can't be proven
// index-compatible with Record<string, number>; the runtime shape is
// guaranteed by the Target type, so cast once here.
export const resolveTarget = <Tag extends Entity.EntityTag>(
	target: Target<Tag>,
	current: Entity.EntityByTag<Tag>,
): Record<string, number> =>
	(typeof target === "function"
		? target(current)
		: target) as unknown as Record<string, number>;

// start values for the keys of `target`: from `explicitFrom` where given,
// otherwise from the instance's current data
export const startValues = (
	current: unknown,
	target: Record<string, number>,
	explicitFrom: Record<string, number>,
): Record<string, number> => {
	const start: Record<string, number> = {};
	for (const key of Object.keys(target)) {
		const from = explicitFrom[key] ?? (current as Record<string, number>)[key];
		// an optional field that was never set has no start value — lerping
		// from undefined would silently produce NaN frames; die loudly instead
		if (from === undefined) {
			throw new Error(
				`tween: "${key}" has no current value to start from — pass an explicit from`,
			);
		}
		start[key] = from;
	}
	return start;
};

const animate = Effect.fnUntraced(function* <
	Tag extends Entity.EntityTag,
	E = never,
	R = never,
>(
	instanceOrEffect: Instance.InstanceOrEffect<Tag, E, R>,
	from: Target<Tag> | undefined,
	to: Target<Tag>,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) {
	const instance = yield* Instance.flattenInstance(instanceOrEffect);
	const current = yield* Scene.data(instance);
	const target = resolveTarget(to, current);
	const start = startValues(
		current,
		target,
		from === undefined ? {} : resolveTarget(from, current),
	);
	yield* interpolate(
		start,
		target,
		duration,
		(value) =>
			// Entity.EntityByTag<Tag> is opaque to TS, so spread is disallowed — assign + cast
			Scene.update(
				instance,
				(data) => Object.assign({}, data, value) as Entity.EntityByTag<Tag>,
			),
		timing,
	);
	return instance;
});

// dispatch on the first argument, not arity: the optional trailing
// `timing` makes call arity ambiguous between the two forms
const firstArgIsInstance = (args: IArguments) => Instance.isInstance(args[0]);

/**
 * Animate interpolable (numeric) props of an instance toward `to` over
 * `duration` by raw field name, starting from the instance's current
 * data, optionally paced by a timing function (name or function, default
 * linear). Dual: `tweenTo(instance, to, duration, timing?)` or
 * `instance.pipe(tweenTo(to, duration, timing?))`. Resolves with the
 * instance, so animations chain.
 */
export const tweenTo = dual<
	<Tag extends Entity.EntityTag>(
		to: Target<Tag>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Entity.EntityTag, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		to: Target<Tag>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, to, duration, timing) =>
	animate(instance, undefined, to, duration, timing),
);

/**
 * Parametric animator: each frame applies `fn` with the eased parameter
 * and the current data, then ticks. The final frame receives exactly
 * `t = 1` for any timing with f(1) = 1; a zero-length duration still
 * takes one frame. This is the primitive under coordinated multi-field
 * motion — arcs, orbits, counters — where independent per-field tweens
 * cannot express the coupling. Determinism: `fn` sees only `(t, data)`.
 * Dual: `drive(instance, duration, timing, fn)` or
 * `instance.pipe(drive(duration, timing, fn))`.
 */
export const drive = dual<
	<Tag extends Entity.EntityTag>(
		duration: Duration.Input,
		timing: Timing.TimingInput,
		fn: (t: number, data: Entity.EntityByTag<Tag>) => Entity.EntityByTag<Tag>,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Entity.EntityTag, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		duration: Duration.Input,
		timing: Timing.TimingInput,
		fn: (t: number, data: Entity.EntityByTag<Tag>) => Entity.EntityByTag<Tag>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(
	firstArgIsInstance,
	Effect.fnUntraced(function* (instanceOrEffect, duration, timing, fn) {
		const instance = yield* Instance.flattenInstance(instanceOrEffect);
		const runner = yield* Runner.Runner;
		const timingFn = Timing.resolve(timing);
		const frames = Math.max(
			1,
			Time.toFrames(duration, runner.settings.frameRate),
		);
		for (let i = 1; i <= frames; i++) {
			const t = timingFn(i / frames);
			yield* Scene.update(instance, (data) => fn(t, data));
			yield* Scene.tick;
		}
		return instance;
	}),
);

/**
 * Like `tweenTo`, but with an explicit start: interpolates the keys of
 * `to` from `from` (keys missing in `from` start at the current data).
 * Dual: `tween(instance, from, to, duration, timing?)` or
 * `instance.pipe(tween(from, to, duration, timing?))`.
 */
export const tween = dual<
	<Tag extends Entity.EntityTag>(
		from: Target<Tag>,
		to: Target<Tag>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Entity.EntityTag, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		from: Target<Tag>,
		to: Target<Tag>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, from, to, duration, timing) =>
	animate(instance, from, to, duration, timing),
);

// ── semantic layer ─────────────────────────────────────────────────────
// The lens is gone. Every entity's position IS `data.position`, so what was
// `traitOrDie(entity, "~position")` + get/set collapses into the two
// functions below — a constant path, with nothing per-entity to dispatch on.
// This is what "traits were unnecessary" means in code (design D2/D3).

/** a 3D position as the semantic animators speak it */
export type Position = {
	readonly x: number;
	readonly y: number;
	readonly z: number;
};

/** tags whose entity carries a position: every one of them */
type Positionable = Entity.TagsWith<"position">;
/** tags whose entity carries opacity: every paintable one (not Camera) */
type Fadeable = Entity.TagsWith<"opacity">;

const readPosition = (data: { position: Entity.Vec3 }): Position =>
	data.position;

/**
 * Structural parameter, not `EntityByTag<Tag>`: `Tag extends Fadeable`
 * guarantees the field, but TypeScript will not distribute that constraint
 * over the union, so asking for the shape directly is both true and simpler
 * than an intersection type that never resolves.
 */
const readOpacity = (data: { opacity: number }): number => data.opacity;

/**
 * Write a position, holding unnamed channels at their current value — the
 * channel-level sparseness rule (design D8) that has to survive `position`
 * becoming a nested Vec3. A partial Vec3 must never reach `interpolate`:
 * lerping an absent channel yields NaN frames.
 */
const writePosition = <T extends { position: Entity.Vec3 }>(
	data: T,
	value: Partial<Position>,
): T => ({
	...data,
	position: Entity.vec3({
		x: value.x ?? data.position.x,
		y: value.y ?? data.position.y,
		z: value.z ?? data.position.z,
	}),
});

const animatePosition = Effect.fnUntraced(function* <
	Tag extends Positionable,
	E = never,
	R = never,
>(
	instanceOrEffect: Instance.InstanceOrEffect<Tag, E, R>,
	from: Partial<Position> | undefined,
	to: Partial<Position>,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) {
	const instance = yield* Instance.flattenInstance(instanceOrEffect);
	const current = readPosition(yield* Scene.data(instance));
	// partial targets/origins hold the missing axis at its current value
	const target = { ...current, ...to };
	const start = { ...current, ...(from ?? {}) };
	yield* interpolate(
		start,
		target,
		duration,
		(value) => Scene.update(instance, (data) => writePosition(data, value)),
		timing,
	);
	return instance;
});

const animateOpacity = Effect.fnUntraced(function* <
	Tag extends Fadeable,
	E = never,
	R = never,
>(
	instanceOrEffect: Instance.InstanceOrEffect<Tag, E, R>,
	from: number | undefined,
	to: number,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) {
	const instance = yield* Instance.flattenInstance(instanceOrEffect);
	const current = readOpacity(yield* Scene.data(instance));
	yield* interpolate(
		{ opacity: from ?? current },
		{ opacity: to },
		duration,
		(value) =>
			Scene.update(instance, (data) => ({ ...data, opacity: value.opacity })),
		timing,
	);
	return instance;
});

/**
 * Move an instance to a position. Geometry is relative to `position`, so
 * a Line translates whole and a Group carries its subtree with no
 * per-entity handling.
 * Partial targets hold the missing axis. Dual:
 * `moveTo(instance, to, duration, timing?)` or
 * `instance.pipe(moveTo(to, duration, timing?))`.
 */
export const moveTo = dual<
	<Tag extends Positionable>(
		to: Partial<Position>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Positionable, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		to: Partial<Position>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, to, duration, timing) =>
	animatePosition(instance, undefined, to, duration, timing),
);

/** Like `moveTo`, but from an explicit position (partials filled from current). */
export const move = dual<
	<Tag extends Positionable>(
		from: Partial<Position>,
		to: Partial<Position>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Positionable, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		from: Partial<Position>,
		to: Partial<Position>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, from, to, duration, timing) =>
	animatePosition(instance, from, to, duration, timing),
);

/**
 * Fade an instance's `opacity`. Dual:
 * `fadeTo(instance, opacity, duration, timing?)` or
 * `instance.pipe(fadeTo(opacity, duration, timing?))`.
 */
export const fadeTo = dual<
	<Tag extends Fadeable>(
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Fadeable, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, to, duration, timing) =>
	animateOpacity(instance, undefined, to, duration, timing),
);

/** Like `fadeTo`, but from an explicit opacity. */
export const fade = dual<
	<Tag extends Fadeable>(
		from: number,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Fadeable, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		from: number,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, from, to, duration, timing) =>
	animateOpacity(instance, from, to, duration, timing),
);

/**
 * `Motion.wait(duration)` is both an Effect and a pipe step: yield it
 * directly, or place it between chained animations, where it holds the
 * scene AFTER the previous step and passes that step's result through.
 */
export interface Wait extends Effect.Effect<void, never, Runner.Runner> {
	<A, E, R>(
		effect: Effect.Effect<A, E, R>,
	): Effect.Effect<A, E, R | Runner.Runner>;
}

/**
 * Hold the scene for `duration` of scene time (frames at the runner's
 * frame rate) — `Scene.sleep`'s chainable sibling.
 *
 * - `yield* Motion.wait("1 second")` — plain frame-based sleep
 * - `instance.pipe(moveTo(...), Motion.wait("1 second"), fadeTo(...))`
 *   — the hold runs between the two animations and the instance flows on
 */
export const wait = (duration: Duration.Input): Wait =>
	Object.assign(
		<A, E, R>(
			effect: Effect.Effect<A, E, R>,
		): Effect.Effect<A, E, R | Runner.Runner> =>
			Effect.tap(effect, () => Scene.sleep(duration)),
		Effectable.Prototype<Effect.Effect<void, never, Runner.Runner>>({
			label: "Motion.wait",
			evaluate: () => Scene.sleep(duration),
		}),
	) as Wait;
