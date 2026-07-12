import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import type * as Schema from "effect/Schema";
import * as Types from "effect/Types";
import { HttpClientResponse } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { Activity } from "effect/unstable/workflow";
import type * as Instance from "./Instance";
import * as Runner from "./Runner";
import * as Scene from "./Scene";
import * as Time from "./Time";

// import { Runner } from "./Runner";
Activity;

export type InterpolableValue = number;
const lerpSimple = (from: number, to: number, t: number) =>
	from + (to - from) * t;

export const lerp = Effect.fnUntraced(function* <
	T extends { [key: string]: InterpolableValue },
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
	const frames = Time.toFrames(duration, runner.settings.frameRate);
	let value = from;
	for (let i = 0; i < frames; i++) {
		const t = i / frames;
		value = { ...from };
		for (const key of keys) {
			Object.assign(value, {
				[key]: lerpSimple(
					from[key as keyof T] as number,
					to[key as keyof T] as number,
					t,
				),
			});
		}
		yield* fn(value);
		yield* Scene.tick;
	}
	// for (let i = 0; i < frames; i++) {
});

type InterpolableKeys<T> = {
	[K in keyof T]: T[K] extends InterpolableValue ? K : never;
}[keyof T];

type InterpolableOnly<T> = Pick<T, InterpolableKeys<T>>;

const internalMoveTo = Effect.fnUntraced(function* <
	Name extends string,
	Data extends Schema.Top,
>(
	instance: Instance.Instance<Name, Data>,
	to:
		| InterpolableOnly<Data["Type"]>
		| ((data: Data["Type"]) => InterpolableOnly<Data["Type"]>),
	duration: Duration.Input,
) {
	const current = yield* Scene.data(instance);
	const resolvedTo = typeof to === "function" ? to(current) : to;
	const keys = Object.keys(resolvedTo);
	const value = { ...resolvedTo };
	const from = {} as InterpolableOnly<Data["Type"]>;

	for (const key of keys) {
		Object.assign(from, {
			[key]: current[key as keyof Data["Type"]],
		});
		Object.assign(value, {
			[key]: resolvedTo[key as keyof InterpolableOnly<Data["Type"]>],
		});
	}
	yield* lerp(from as never, resolvedTo as never, duration, (value) =>
		Scene.update(instance, (data) => Object.assign({}, data, value)),
	);
	return instance;
});

type Update<In, Out> = Out | ((data: In) => Out);
export const moveTo: {
	<const Name extends string, const Data extends Schema.Top>(
		to: Update<Data["Type"], Partial<InterpolableOnly<Data["Type"]>>>,
		duration: Duration.Input,
	): (
		instance: Instance.Instance<Name, Data>,
	) => Effect.Effect<Instance.Instance<Name, Data>, never, void>;

	<const Name extends string, const Data extends Schema.Top>(
		instance: Instance.Instance<Name, Data>,
		to: Update<Data["Type"], Partial<InterpolableOnly<Data["Type"]>>>,
		duration: Duration.Input,
	): Effect.Effect<Instance.Instance<Name, Data>, never, void>;
} = (...args) => {
	if (args.length === 2) {
		return (instance) => {
			console.log({
				instance,
				to: args[0],
				duration: args[1],
			});
			return internalMoveTo(instance, args[0], args[1]);
		};
	}
	console.log({
		instance: args[0],
		to: args[1],
		duration: args[2],
	});
	return internalMoveTo(args[0], args[1], args[2]);
};
// export const moveTo:{
// 	<
// 	Name extends string,
// 	Data extends Schema.Top,
// >(
// 	to: Update<Data["Type"], InterpolableOnly<Data["Type"]>>,
// 	duration: Duration.Input,
// ) => (instance: Instance.Instance<Name, Data>) => internalMoveTo(instance, to, duration);

// } = {} as any
