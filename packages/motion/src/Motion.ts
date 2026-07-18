import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Effectable from "effect/Effectable";
import { dual } from "effect/Function";
import type * as Schema from "effect/Schema";
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
export type Target<Data extends Schema.Top> =
	| Partial<InterpolableOrInterpolator<Data["Type"]>>
	| ((data: Data["Type"]) => Partial<InterpolableOrInterpolator<Data["Type"]>>);

// InterpolableOnly of an opaque Data["Type"] can't be proven
// index-compatible with Record<string, number>; the runtime shape is
// guaranteed by the Target type, so cast once here.
export const resolveTarget = <Data extends Schema.Top>(
	target: Target<Data>,
	current: Data["Type"],
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
	Name extends string,
	Data extends Schema.Top,
	Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
	E = never,
	R = never,
>(
	instanceOrEffect: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	from: Target<Data> | undefined,
	to: Target<Data>,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) {
	const instance = yield* Instance.flatten(instanceOrEffect);
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
			// Data["Type"] is opaque to TS, so spread is disallowed — assign + cast
			Scene.update(
				instance,
				(data) => Object.assign({}, data, value) as Data["Type"],
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
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
	>(
		to: Target<Data>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>,
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
		E = never,
		R = never,
	>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
		to: Target<Data>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>
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
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
	>(
		duration: Duration.Input,
		timing: Timing.TimingInput,
		fn: (t: number, data: Data["Type"]) => Data["Type"],
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>,
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
		E = never,
		R = never,
	>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
		duration: Duration.Input,
		timing: Timing.TimingInput,
		fn: (t: number, data: Data["Type"]) => Data["Type"],
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>
>(
	firstArgIsInstance,
	Effect.fnUntraced(function* (instanceOrEffect, duration, timing, fn) {
		const instance = yield* Instance.flatten(instanceOrEffect);
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
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
	>(
		from: Target<Data>,
		to: Target<Data>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>,
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
		E = never,
		R = never,
	>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
		from: Target<Data>,
		to: Target<Data>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>
>(firstArgIsInstance, (instance, from, to, duration, timing) =>
	animate(instance, from, to, duration, timing),
);

// ── semantic layer: trait-based helpers ────────────────────────────────
// one recipe: read origin via the lens's get (base forms take an explicit
// one), animate the extracted value, apply via set each frame

type HasPosition<Data extends Schema.Top> = {
	readonly "~position": Entity.TraitLens<Data["Type"], Entity.Position>;
};
type HasOpacity<Data extends Schema.Top> = {
	readonly "~opacity": Entity.TraitLens<Data["Type"], number>;
};

const animatePosition = Effect.fnUntraced(function* <
	Name extends string,
	Data extends Schema.Top,
	Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
	E = never,
	R = never,
>(
	instanceOrEffect: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	from: Partial<Entity.Position> | undefined,
	to: Partial<Entity.Position>,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) {
	const instance = yield* Instance.flatten(instanceOrEffect);

	const lens = Entity.traitOrDie<Data["Type"], Entity.Position>(
		instance.entity,
		"~position",
	);
	const current = lens.get(yield* Scene.data(instance));
	// partial targets/origins hold the missing axis at its current value
	const target = { ...current, ...to };
	const start = { ...current, ...(from ?? {}) };
	yield* interpolate(
		start,
		target,
		duration,
		(value) => Scene.update(instance, (data) => lens.set(data, value)),
		timing,
	);
	return instance;
});

const animateOpacity = Effect.fnUntraced(function* <
	Name extends string,
	Data extends Schema.Top,
	Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
	E = never,
	R = never,
>(
	instanceOrEffect: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	from: number | undefined,
	to: number,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) {
	const instance = yield* Instance.flatten(instanceOrEffect);
	const lens = Entity.traitOrDie<Data["Type"], number>(
		instance.entity,
		"~opacity",
	);
	const current = lens.get(yield* Scene.data(instance));
	yield* interpolate(
		{ opacity: from ?? current },
		{ opacity: to },
		duration,
		(value) => Scene.update(instance, (data) => lens.set(data, value.opacity)),
		timing,
	);
	return instance;
});

/**
 * Move an instance to a position via its `~position` trait — per-entity
 * semantics (a Line translates whole, a Group carries its subtree).
 * Partial targets hold the missing axis. Dual:
 * `moveTo(instance, to, duration, timing?)` or
 * `instance.pipe(moveTo(to, duration, timing?))`.
 */
export const moveTo = dual<
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>> &
			HasPosition<Data>,
	>(
		to: Partial<Entity.Position>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>,
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>> &
			HasPosition<Data>,
		E = never,
		R = never,
	>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
		to: Partial<Entity.Position>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>
>(firstArgIsInstance, (instance, to, duration, timing) =>
	animatePosition(instance, undefined, to, duration, timing),
);

/** Like `moveTo`, but from an explicit position (partials filled from current). */
export const move = dual<
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>> &
			HasPosition<Data>,
	>(
		from: Partial<Entity.Position>,
		to: Partial<Entity.Position>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>,
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>> &
			HasPosition<Data>,
		E = never,
		R = never,
	>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
		from: Partial<Entity.Position>,
		to: Partial<Entity.Position>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>
>(firstArgIsInstance, (instance, from, to, duration, timing) =>
	animatePosition(instance, from, to, duration, timing),
);

/**
 * Fade an instance's opacity via its `~opacity` trait. Dual:
 * `fadeTo(instance, opacity, duration, timing?)` or
 * `instance.pipe(fadeTo(opacity, duration, timing?))`.
 */
export const fadeTo = dual<
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>> &
			HasOpacity<Data>,
	>(
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>,
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>> &
			HasOpacity<Data>,
		E = never,
		R = never,
	>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>
>(firstArgIsInstance, (instance, to, duration, timing) =>
	animateOpacity(instance, undefined, to, duration, timing),
);

/** Like `fadeTo`, but from an explicit opacity. */
export const fade = dual<
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>> &
			HasOpacity<Data>,
	>(
		from: number,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>,
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>> &
			HasOpacity<Data>,
		E = never,
		R = never,
	>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
		from: number,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>
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
