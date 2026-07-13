import { Layer } from "effect";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Random from "effect/Random";
import type * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import type * as Entity from "./Entity";
import type * as Instance from "./Instance";
import * as Phaser from "./Phaser";
import * as Runner from "./Runner";
import * as Time from "./Time";

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
	Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
>(
	entity: Entity.Entity<Name, Data, Traits>,
	props: Data["~type.make.in"],
	options?: Runner.InstantiateOptions,
): Effect.fn.Return<
	Instance.Instance<Name, Data, Traits>,
	void,
	Entity.Entity<Name, Data, Traits> | Runner.Runner
> {
	const runner = yield* Runner.Runner;
	return yield* runner.instantiate(entity, props, options);
});

export const tick = Effect.gen(function* () {
	const runner = yield* Runner.Runner;
	return yield* runner.phaser.arriveAndAwaitAdvance;
});

/**
 * Hold the scene for `duration` of scene time (frames at the runner's
 * frame rate) — `Effect.sleep`'s sibling, but in frames, not wall time.
 * A zero-length duration is a no-op.
 */
export const sleep = (duration: Duration.Input) =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner;
		const frames = Time.toFrames(duration, runner.settings.frameRate);
		for (let i = 0; i < frames; i++) {
			yield* tick;
		}
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
	/** id of the root group (conventionally "root"); never rendered itself */
	root: string;
}
export const step = <E, R, Entities extends Entity.AnyEntity>(
	runningScene: RunningScene<E, R, Entities>,
) =>
	Effect.gen(function* () {
		if (runningScene.done) {
			// propagate a failed scene's cause instead of ending silently
			const exit = yield* Fiber.await(runningScene.fiber);
			if (Exit.isFailure(exit)) {
				return yield* Effect.failCause(exit.cause);
			}
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
export const run = <E, R, Entities>(
	scene: Scene<E, R, Entities>,
	settings: Partial<Runner.Settings> = {},
) =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner.make(settings);
		// Phaser.run registers the root party BEFORE forking (no startup
		// race), deregisters via finalizer, and provides the Phaser service
		// so Phaser.one / Phaser.all work inside scenes.
		let done = false;
		const fiber = yield* Phaser.run(
			runner.phaser,
			scene.runner.pipe(
				Effect.scoped,
				// success, failure, or interrupt: the scene is over either way
				Effect.ensuring(
					Effect.sync(() => {
						done = true;
					}),
				),
				Effect.provide(Layer.succeed(Runner.Runner, runner)),
				// seeded pseudo-randomness, scoped to the scene fiber
				Random.withSeed(runner.settings.seed),
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
	settings: Partial<Runner.Settings> = {},
) =>
	run(scene, settings).pipe(
		Effect.map((runningScene) =>
			Stream.fromEffectRepeat(step(runningScene)).pipe(
				// refinement: the stream ends at the first null, so the
				// element type is Frame<Entities>, not Frame | null
				Stream.takeWhile((state): state is Frame<Entities> => state !== null),
			),
		),
		Stream.unwrap

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
