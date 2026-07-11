import { Layer } from "effect";
import * as Effect from "effect/Effect";
import type * as Fiber from "effect/Fiber";
import type * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import type * as Entity from "./Entity";
import type * as Instance from "./Instance";
import * as Phaser from "./Phaser";
import * as Runner from "./Runner";

export const TypeId = "~motion/Scene" as const;
export interface Scene<E, R, Entities> {
	readonly [TypeId]: typeof TypeId;
	readonly runner: Effect.Effect<void, E, R | Scope.Scope>;
	readonly "~entities": Entities;
}

type MakeEffect<Eff extends Effect.Effect<any, any, any>, AEff> = Effect.Effect<
	AEff,
	[Eff] extends [never]
		? never
		: [Eff] extends [Effect.Effect<infer _A, infer E, infer _R>]
			? E
			: never,
	[Eff] extends [never]
		? never
		: [Eff] extends [Effect.Effect<infer _A, infer _E, infer R>]
			? R
			: never
>;
export const make = <Eff extends Effect.Effect<any, any, any>, AEff>(
	f: () => Generator<Eff, void, never>,
): MakeEffect<Eff, AEff> extends Effect.Effect<AEff, infer E, infer R>
	? Scene<E, Exclude<R, Entity.Entity>, Extract<R, Entity.Entity> | Scope.Scope>
	: never => {
	return {
		runner: Effect.scoped(Effect.gen(f)),
	} as never;
};

export const instantiate = Effect.fnUntraced(function* <
	Name extends string,
	Data extends Schema.Top,
>(
	entity: Entity.Entity<Name, Data>,
	props: Data["~type.make.in"],
): Effect.fn.Return<
	Instance.Instance<Name, Data>,
	void,
	Entity.Entity<Name, Data> | Runner.Runner
> {
	const runner = yield* Runner.Runner;
	return yield* runner.instantiate(entity, props);
});

export const tick = Effect.gen(function* () {
	const runner = yield* Runner.Runner;
	return yield* runner.phaser.arriveAndAwaitAdvance;
});

export const step = <R>(runningScene: RunningScene<R>) =>
	Effect.gen(function* () {
		if (runningScene.done) {
			return null;
		}
		yield* runningScene.runner.phaser.awaitAdvance;
		return yield* runningScene.runner.state;
	});
interface RunningScene<E> {
	readonly runner: Runner.Runner["Service"];

	readonly fiber: Fiber.Fiber<void, E>;
	readonly done: boolean;
}
export const run = <E, R1, R2>(scene: Scene<E, R1, R2>) =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner.make();
		// Phaser.run registers the root party BEFORE forking (no startup
		// race), deregisters via finalizer, and provides the Phaser service
		// so Phaser.one / Phaser.all work inside scenes.
		let done = false;
		const fiber = yield* Phaser.run(
			runner.phaser,
			scene.runner.pipe(
				Effect.andThen(() => {
					done = true;
					return Effect.void;
				}),
				Effect.scoped,
				Effect.provide(Layer.succeed(Runner.Runner, runner)),
			),
		);

		const runningScene: RunningScene<E> = {
			runner,
			fiber,
			get done() {
				return done;
			},
		};
		return runningScene;
	});

export const stream = <R>(runningScene: RunningScene<R>) =>
	Stream.fromEffectRepeat(step(runningScene)).pipe(
		Stream.takeWhile((state) => state !== null),
	);

type Updater<Data> = Data | ((data: Data) => Data);
const isUpdaterFn = <Data>(
	props: Updater<Data>,
): props is (data: Data) => Data => typeof props === "function";

export const update = <Name extends string, Data extends Schema.Top>(
	instance: Instance.Instance<Name, Data>,
	props: Updater<Data["Type"]>,
) =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner;
		if (isUpdaterFn(props)) {
			const current = runner.getDataUnsafe(instance);
			// instance was destroyed: nothing to update
			if (current === null) {
				return false;
			}
			return runner.setDataUnsafe(instance, props(current));
		}
		return runner.setDataUnsafe(instance, props);
	});
