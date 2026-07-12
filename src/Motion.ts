import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import type * as Schema from "effect/Schema";
import type * as Instance from "./Instance";
import * as Runner from "./Runner";
import * as Scene from "./Scene";
import * as Time from "./Time";

export type InterpolableValue = number;

type InterpolableKeys<T> = {
	[K in keyof T]: T[K] extends InterpolableValue ? K : never;
}[keyof T];

export type InterpolableOnly<T> = Pick<T, InterpolableKeys<T>>;

const lerpNumber = (from: number, to: number, t: number) =>
	from + (to - from) * t;

/**
 * Interpolate from `from` to `to` over `duration`, calling `fn` with the
 * current value once per frame (each step ends in a Scene.tick). The last
 * call receives exactly `to`; a zero-length duration still takes one frame.
 */
const lerp = Effect.fnUntraced(function* <
	T extends Record<string, InterpolableValue>,
	A,
	E,
	R,
>(
	from: T,
	to: T,
	duration: Duration.Input,
	fn: (value: T) => Effect.Effect<A, E, R>,
) {
	const runner = yield* Runner.Runner;
	const keys = Object.keys(from);
	const frames = Math.max(
		1,
		Time.toFrames(duration, runner.settings.frameRate),
	);
	for (let i = 1; i <= frames; i++) {
		const t = i / frames;
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
const resolveTarget = <Data extends Schema.Top>(
	target: Target<Data>,
	current: Data["Type"],
): Record<string, number> =>
	(typeof target === "function"
		? target(current)
		: target) as unknown as Record<string, number>;

const animate = Effect.fnUntraced(function* <
	Name extends string,
	Data extends Schema.Top,
>(
	instance: Instance.Instance<Name, Data>,
	from: Target<Data> | undefined,
	to: Target<Data>,
	duration: Duration.Input,
) {
	const current = yield* Scene.data(instance);
	const target = resolveTarget(to, current);
	const explicitFrom = from === undefined ? {} : resolveTarget(from, current);
	// interpolate the keys of `to`; start values come from `from` where
	// given, otherwise from the instance's current data
	const start: Record<string, number> = {};
	for (const key of Object.keys(target)) {
		start[key] =
			explicitFrom[key] ?? ((current as Record<string, number>)[key] as number);
	}
	yield* lerp(start, target, duration, (value) =>
		// Data["Type"] is opaque to TS, so spread is disallowed — assign + cast
		Scene.update(
			instance,
			(data) => Object.assign({}, data, value) as Data["Type"],
		),
	);
	return instance;
});

/**
 * Animate interpolable (numeric) props of an instance toward `to` over
 * `duration`, one Scene.tick per frame, starting from the instance's
 * current data. Dual: data-first `moveTo(instance, to, duration)` or
 * data-last for pipes `instance.pipe(moveTo(to, duration))`. Resolves
 * with the instance, so moves chain.
 */
export const moveTo = dual<
	<Name extends string, Data extends Schema.Top>(
		to: Target<Data>,
		duration: Duration.Input,
	) => (
		instance: Instance.Instance<Name, Data>,
	) => Effect.Effect<Instance.Instance<Name, Data>, never, Runner.Runner>,
	<Name extends string, Data extends Schema.Top>(
		instance: Instance.Instance<Name, Data>,
		to: Target<Data>,
		duration: Duration.Input,
	) => Effect.Effect<Instance.Instance<Name, Data>, never, Runner.Runner>
>(3, (instance, to, duration) => animate(instance, undefined, to, duration));

/**
 * Like `moveTo`, but with an explicit start: interpolates the keys of
 * `to` from `from` (keys missing in `from` start at the current data).
 * Dual: data-first `move(instance, from, to, duration)` or data-last
 * `instance.pipe(move(from, to, duration))`.
 */
export const move = dual<
	<Name extends string, Data extends Schema.Top>(
		from: Target<Data>,
		to: Target<Data>,
		duration: Duration.Input,
	) => (
		instance: Instance.Instance<Name, Data>,
	) => Effect.Effect<Instance.Instance<Name, Data>, never, Runner.Runner>,
	<Name extends string, Data extends Schema.Top>(
		instance: Instance.Instance<Name, Data>,
		from: Target<Data>,
		to: Target<Data>,
		duration: Duration.Input,
	) => Effect.Effect<Instance.Instance<Name, Data>, never, Runner.Runner>
>(4, (instance, from, to, duration) => animate(instance, from, to, duration));
