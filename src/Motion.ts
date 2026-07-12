import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import type * as Schema from "effect/Schema";
import * as Instance from "./Instance";
import * as Runner from "./Runner";
import * as Scene from "./Scene";
import * as Time from "./Time";
import * as Timing from "./Timing";

export type InterpolableValue = number;

type InterpolableKeys<T> = {
	[K in keyof T]: T[K] extends InterpolableValue ? K : never;
}[keyof T];

export type InterpolableOnly<T> = Pick<T, InterpolableKeys<T>>;

// extrapolating on purpose: eased t goes outside [0, 1] for back/elastic
const lerpNumber = (from: number, to: number, t: number) =>
	from + (to - from) * t;

/**
 * Interpolate from the explicit `from` to `to` over `duration`, calling
 * `fn` with the eased value once per frame (each step ends in a
 * Scene.tick). The last call receives exactly `to` for any timing with
 * f(1) = 1; a zero-length duration still takes one frame.
 */
export const tween = Effect.fnUntraced(function* <
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
		const value: Record<string, number> = {};
		for (const key of keys) {
			value[key] = lerpNumber(from[key] as number, to[key] as number, t);
		}
		yield* fn(value as T);
		yield* Scene.tick;
	}
});

/** target props, or an updater computing them from the current data */
export type Target<Data extends Schema.Top> =
	| Partial<InterpolableOnly<Data["Type"]>>
	| ((data: Data["Type"]) => Partial<InterpolableOnly<Data["Type"]>>);

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
		start[key] =
			explicitFrom[key] ?? ((current as Record<string, number>)[key] as number);
	}
	return start;
};

const animate = Effect.fnUntraced(function* <
	Name extends string,
	Data extends Schema.Top,
>(
	instance: Instance.Instance<Name, Data>,
	from: Target<Data> | undefined,
	to: Target<Data>,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) {
	const current = yield* Scene.data(instance);
	const target = resolveTarget(to, current);
	const start = startValues(
		current,
		target,
		from === undefined ? {} : resolveTarget(from, current),
	);
	yield* tween(
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
 * `duration`, starting from the instance's current data, optionally
 * paced by a timing function (name or function, default linear). Dual:
 * `moveTo(instance, to, duration, timing?)` or
 * `instance.pipe(moveTo(to, duration, timing?))`. Resolves with the
 * instance, so moves chain.
 */
export const moveTo = dual<
	<Name extends string, Data extends Schema.Top>(
		to: Target<Data>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => (
		instance: Instance.Instance<Name, Data>,
	) => Effect.Effect<Instance.Instance<Name, Data>, never, Runner.Runner>,
	<Name extends string, Data extends Schema.Top>(
		instance: Instance.Instance<Name, Data>,
		to: Target<Data>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<Name, Data>, never, Runner.Runner>
>(firstArgIsInstance, (instance, to, duration, timing) =>
	animate(instance, undefined, to, duration, timing),
);

/**
 * Like `moveTo`, but with an explicit start: interpolates the keys of
 * `to` from `from` (keys missing in `from` start at the current data).
 * Dual: `move(instance, from, to, duration, timing?)` or
 * `instance.pipe(move(from, to, duration, timing?))`.
 */
export const move = dual<
	<Name extends string, Data extends Schema.Top>(
		from: Target<Data>,
		to: Target<Data>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => (
		instance: Instance.Instance<Name, Data>,
	) => Effect.Effect<Instance.Instance<Name, Data>, never, Runner.Runner>,
	<Name extends string, Data extends Schema.Top>(
		instance: Instance.Instance<Name, Data>,
		from: Target<Data>,
		to: Target<Data>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<Name, Data>, never, Runner.Runner>
>(firstArgIsInstance, (instance, from, to, duration, timing) =>
	animate(instance, from, to, duration, timing),
);

const internalTweenTo = Effect.fnUntraced(function* <
	Name extends string,
	Data extends Schema.Top,
	A,
	E,
	R,
>(
	instance: Instance.Instance<Name, Data>,
	to: Target<Data>,
	duration: Duration.Input,
	fn: (
		value: Partial<InterpolableOnly<Data["Type"]>>,
	) => Effect.Effect<A, E, R>,
	timing?: Timing.TimingInput,
) {
	const current = yield* Scene.data(instance);
	const target = resolveTarget(to, current);
	const start = startValues(current, target, {});
	yield* tween(
		start,
		target,
		duration,
		(value) => fn(value as Partial<InterpolableOnly<Data["Type"]>>),
		timing,
	);
	return instance;
});

/**
 * Like `tween`, but the origin is read from the instance's current data
 * at the keys of `to` — the caller only provides the destination and an
 * applier `fn`. Dual: `tweenTo(instance, to, duration, fn, timing?)` or
 * `instance.pipe(tweenTo(to, duration, fn, timing?))`. Resolves with the
 * instance.
 */
export const tweenTo = dual<
	<Name extends string, Data extends Schema.Top, A, E, R>(
		to: Target<Data>,
		duration: Duration.Input,
		fn: (
			value: Partial<InterpolableOnly<Data["Type"]>>,
		) => Effect.Effect<A, E, R>,
		timing?: Timing.TimingInput,
	) => (
		instance: Instance.Instance<Name, Data>,
	) => Effect.Effect<Instance.Instance<Name, Data>, E, Runner.Runner | R>,
	<Name extends string, Data extends Schema.Top, A, E, R>(
		instance: Instance.Instance<Name, Data>,
		to: Target<Data>,
		duration: Duration.Input,
		fn: (
			value: Partial<InterpolableOnly<Data["Type"]>>,
		) => Effect.Effect<A, E, R>,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<Name, Data>, E, Runner.Runner | R>
>(firstArgIsInstance, (instance, to, duration, fn, timing) =>
	internalTweenTo(instance, to, duration, fn, timing),
);
