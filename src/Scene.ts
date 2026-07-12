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
export const make = <const Eff extends Effect.Effect<any, any, any>, AEff>(
	f: () => Generator<Eff, void, never>,
): MakeEffect<Eff, AEff> extends Effect.Effect<AEff, infer E, infer R>
	? Scene<
			E,
			| Exclude<
					R,
					{
						readonly [Entity.TypeId]: typeof Entity.TypeId;
					}
			  >
			| Scope.Scope,
			Extract<
				R,
				{
					readonly [Entity.TypeId]: typeof Entity.TypeId;
				}
			>
		>
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

export interface FrameEntry<Entity extends Entity.AnyEntity> {
	data: Entity["data"]["Type"];
	entity: Entity;
}
export type EntriesFromEntities<Entities> = Entities extends Entity.AnyEntity
	? {
			[K in Entities as K["name"]]: FrameEntry<K>;
		}[Entities["name"]]
	: never;
export interface Frame<Entities extends Entity.AnyEntity> {
	instances: Record<string, EntriesFromEntities<Entities>>;
}
export const step = <E, R, Entities extends Entity.AnyEntity>(
	runningScene: RunningScene<E, R, Entities>,
) =>
	Effect.gen(function* () {
		if (runningScene.done) {
			return null;
		}
		yield* runningScene.runner.phaser.awaitAdvance;
		return (yield* runningScene.runner.state) as Frame<Entities>;
	});
interface RunningScene<E, R, Entities> {
	readonly runner: Runner.Runner["Service"];

	readonly scene: Scene<E, R, Entities>;

	readonly fiber: Fiber.Fiber<void, E>;
	readonly done: boolean;
}
export const run = <E, R, Entities>(scene: Scene<E, R, Entities>) =>
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

		const runningScene: RunningScene<E, R, Entities> = {
			runner,
			fiber,
			scene,
			get done() {
				return done;
			},
		};
		return runningScene;
	});

export const stream = <E, R, Entities extends Entity.AnyEntity>(
	scene: Scene<E, R, Entities>,
) =>
	run(scene).pipe(
		Effect.map((runningScene) =>
			Stream.fromEffectRepeat(step(runningScene)).pipe(
				// refinement: the stream ends at the first null, so the
				// element type is Frame<Entities>, not Frame | null
				Stream.takeWhile((state): state is Frame<Entities> => state !== null),
			),
		),
		Stream.fromEffect,
		Stream.flatten,
	);

type Updater<Data> = Data | ((data: Data) => Data);
const isUpdaterFn = <Data>(
	props: Updater<Data>,
): props is (data: Data) => Data => typeof props === "function";

export const data = <Name extends string, Data extends Schema.Top>(
	instance: Instance.Instance<Name, Data>,
) =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner;
		const current = runner.getDataUnsafe(instance);
		if (current === null) {
			return yield* Effect.die(
				new Error(`Instance ${instance.id} was destroyed`),
			);
		}
		return current;
	});
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

export const settings = Effect.fnUntraced(function* () {
	const runner = yield* Runner.Runner;
	return runner.settings;
});
