import { Layer } from "effect";
import * as Cause from "effect/Cause";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Random from "effect/Random";
import type * as Schedule from "effect/Schedule";
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
		// done: the scene fiber ended. awaitedCount === 0: the body and every
		// fork completed — the scene is over even if its fiber is still
		// winding down through finalizers. Deciding here, from synchronous
		// bookkeeping, keeps frame counts deterministic: the hot frame loop
		// can starve the scene fiber for many frames, so waiting for its own
		// drain to stop backgrounds would leak extra frames.
		if (runningScene.done || runningScene.runner.awaitedCount() === 0) {
			// scene end includes stopping backgrounds (idempotent with the
			// scene fiber's own drain)
			yield* Fiber.interruptAll(runningScene.runner.backgrounds);
			// propagate a failed scene's cause instead of ending silently
			const exit = yield* Fiber.await(runningScene.fiber);
			if (Exit.isFailure(exit)) {
				return yield* Effect.failCause(exit.cause);
			}
			return null;
		}
		const { maxFrames } = runningScene.runner.settings;
		if (runningScene.framesDelivered >= maxFrames) {
			return yield* Effect.die(
				new Error(
					`Scene exceeded maxFrames (${maxFrames}). Raise the maxFrames setting, or set maxFrames: Infinity for an intentionally infinite scene.`,
				),
			);
		}
		yield* runningScene.runner.phaser.awaitAdvance;
		runningScene.framesDelivered++;
		return (yield* runningScene.runner.state) as Frame<Entities>;
	});
interface RunningScene<E, R, Entities> {
	readonly runner: Runner.Runner["Service"];

	readonly scene: Scene<E, R, Entities>;

	readonly fiber: Fiber.Fiber<void, E>;
	readonly done: boolean;
	/** frames delivered so far — mutated by `step` for the maxFrames cap */
	framesDelivered: number;
}
export const run = <E, R, Entities>(
	scene: Scene<E, R, Entities>,
	settings: Partial<Runner.Settings> = {},
) =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner.make(settings);
		let done = false;

		// Once the body can no longer tick, its party slot must go — a
		// registered-but-never-arriving root would deadlock quiescence while
		// forks drain. Released at most once: the drain paths release it
		// eagerly, the ensuring covers external interruption.
		let rootReleased = false;
		const releaseRoot = Effect.sync(() => {
			if (!rootReleased) {
				rootReleased = true;
				// count BEFORE deregister: deregistering can synchronously
				// resume the frame consumer, which must observe the scene as
				// no-longer-awaited or it will spin out empty frames
				runner.countAwaited(-1);
				runner.phaser.deregister(1);
			}
		});

		// Join every awaited fork (forks may spawn more forks while we
		// drain), then stop the backgrounds — backgrounds live through the
		// drain, "scene end" includes it. A fork's own failure fails the
		// scene; a fork that was merely interrupted does not.
		const drain = Effect.gen(function* () {
			const joined = new Set<Fiber.Fiber<unknown, unknown>>();
			// fork error types are erased at the fork boundary (the caller
			// gets the fiber, not the error channel), so the cause comes
			// back as E only by assertion
			let failure: Cause.Cause<E> | undefined;
			while (true) {
				const pending = [...runner.forks].filter((f) => !joined.has(f));
				if (pending.length === 0) {
					break;
				}
				for (const forkFiber of pending) {
					joined.add(forkFiber);
					const exit = yield* Fiber.await(forkFiber);
					if (
						failure === undefined &&
						Exit.isFailure(exit) &&
						!Cause.hasInterruptsOnly(exit.cause)
					) {
						failure = exit.cause as Cause.Cause<E>;
					}
				}
			}
			yield* Fiber.interruptAll(runner.backgrounds);
			if (failure !== undefined) {
				return yield* Effect.failCause(failure);
			}
		});

		// register the root party BEFORE forking (no startup race); the
		// Phaser service is provided so Phaser.one / Phaser.all work inside
		// scenes
		const fiber = yield* Effect.uninterruptibleMask(() =>
			Effect.suspend(() => {
				runner.phaser.register(1);
				runner.countAwaited(1);
				return Effect.interruptible(
					scene.runner.pipe(
						Effect.scoped,
						Effect.matchCauseEffect({
							onSuccess: () => releaseRoot.pipe(Effect.andThen(drain)),
							// a failed body takes everything down with it
							onFailure: (cause) =>
								releaseRoot.pipe(
									Effect.andThen(
										Fiber.interruptAll([
											...runner.forks,
											...runner.backgrounds,
										]),
									),
									Effect.andThen(Effect.failCause(cause)),
								),
						}),
					),
				).pipe(
					Effect.ensuring(releaseRoot),
					// success, failure, or interrupt: the scene is over either way
					Effect.ensuring(
						Effect.sync(() => {
							done = true;
						}),
					),
					Effect.provide(Layer.succeed(Phaser.Phaser, runner.phaser)),
					Effect.provide(Layer.succeed(Runner.Runner, runner)),
					// seeded pseudo-randomness, scoped to the scene fiber
					Random.withSeed(runner.settings.seed),
					Effect.forkChild,
				);
			}),
		);

		const runningScene: RunningScene<E, R, Entities> = {
			runner,
			fiber,
			scene,
			get done() {
				return done;
			},
			framesDelivered: 0,
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
		Stream.unwrap,
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

// the phaser's phase counter IS the current frame index
const frameOf = (runner: Runner.Runner["Service"]) =>
	runner.phaser.snapshotUnsafe().phase;

/**
 * Run `effect`, then repeat it as long as `schedule` recurs, with the
 * schedule evaluated in scene time (frames at the runner's frame rate) —
 * `Effect.repeat`'s sibling, but paced by frames instead of the wall
 * clock. The first run is immediate; the schedule paces the gaps after
 * runs; each run's result is fed to the schedule as input. Resolves with
 * the schedule's final output once it is done; a failed run fails
 * immediately without consulting the schedule again.
 */
export const repeat = <A, E, R, Output, ScheduleE, ScheduleR>(
	effect: Effect.Effect<A, E, R>,
	schedule: Schedule.Schedule<Output, A, ScheduleE, ScheduleR>,
): Effect.Effect<
	Output,
	E | ScheduleE,
	R | ScheduleR | Runner.Runner
> =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner;
		const driver = yield* Time.scheduleDriver(
			schedule,
			runner.settings.frameRate,
		);
		const currentFrame = () => frameOf(runner);
		while (true) {
			const result = yield* effect;
			const decision = yield* driver.next(currentFrame(), result);
			if (decision.done) {
				return decision.output;
			}
			while (currentFrame() < decision.frame) {
				yield* tick;
			}
		}
	});

/**
 * Run `effect` concurrently with the rest of the scene, sharing frame
 * phases, and return its fiber immediately.
 *
 * NOTE: this inverts Effect's own `fork` semantics — the scene's end
 * WAITS for forked work. A scene whose body returns while forks are
 * still animating keeps producing frames until the last fork finishes
 * (so a scene containing only a fork still plays). Use
 * {@link background} for work that should be cut off at scene end
 * instead. Forks are supervised by the fiber that spawned them: a fork
 * made inside another fork is interrupted when its spawner completes.
 */
export const fork = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner;
		// counted before the fork (no gap), uncounted in the fork's own
		// finalizer — synchronous with its phaser-party release
		runner.countAwaited(1);
		// Phaser.run registers the party synchronously before forking, so a
		// fork can never miss the frame it was spawned in
		const fiber = yield* Phaser.run(
			runner.phaser,
			effect.pipe(
				Effect.ensuring(Effect.sync(() => runner.countAwaited(-1))),
			),
		);
		runner.forks.add(fiber);
		return fiber;
	});

/**
 * Like {@link fork}, but the fiber is INTERRUPTED at scene end instead
 * of awaited — for indefinite work (`Scene.repeat(…, Schedule.forever)`)
 * that should play for the duration of the scene without keeping it
 * alive. "Scene end" includes the fork drain: backgrounds keep animating
 * while awaited forks finish, and are stopped after the last one.
 */
export const background = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner;
		const fiber = yield* Phaser.run(runner.phaser, effect);
		runner.backgrounds.add(fiber);
		return fiber;
	});

export interface AllOptions<ScheduleE = never, ScheduleR = never> {
	/**
	 * Staggers the START of each effect: the first releases immediately,
	 * each next one on the schedule's next emission (in scene time). The
	 * schedule also bounds HOW MANY effects are released — effects beyond
	 * its recursion limit are skipped entirely.
	 */
	readonly schedule?: Schedule.Schedule<unknown, void, ScheduleE, ScheduleR>;
}

/**
 * Run effects in parallel, sharing frame phases — the public counterpart
 * to the low-level `Phaser.all`. With `{ schedule }`, starts are
 * staggered and possibly truncated (see {@link AllOptions}); released
 * effects run concurrently and `all` resolves when the last one
 * finishes (release pacing never delays completion). Resolves with the
 * number of effects actually released.
 */
export const all = <
	Eff extends Effect.Effect<any, any, any>,
	ScheduleE = never,
	ScheduleR = never,
>(
	effects: Iterable<Eff>,
	options?: AllOptions<ScheduleE, ScheduleR>,
): Effect.Effect<
	{ released: number },
	(Eff extends Effect.Effect<any, infer E, any> ? E : never) | ScheduleE,
	| (Eff extends Effect.Effect<any, any, infer R> ? R : never)
	| Phaser.Phaser
	| Runner.Runner
	| ScheduleR
> =>
	Effect.gen(function* () {
		const list = Array.from(effects);
		if (options?.schedule === undefined) {
			yield* Phaser.all(list);
			return { released: list.length };
		}
		const runner = yield* Runner.Runner;
		const driver = yield* Time.scheduleDriver(
			options.schedule,
			runner.settings.frameRate,
		);
		// Stagger decisions don't depend on the effects' results, so every
		// release frame is decided up front — still exactly one driver step
		// per release, each fed the scene time it would observe live. The
		// branches then tick to their frame inside a plain Phaser.all, which
		// owns all party accounting.
		const start = frameOf(runner);
		const releaseFrames: number[] = list.length > 0 ? [start] : [];
		let now = start;
		while (releaseFrames.length < list.length) {
			const decision = yield* driver.next(now, void 0);
			if (decision.done) {
				// schedule over: the remaining effects are skipped
				break;
			}
			now = Math.max(now, decision.frame);
			releaseFrames.push(now);
		}
		const branches = releaseFrames.map((frame, i) =>
			Effect.gen(function* () {
				while (frameOf(runner) < frame) {
					yield* tick;
				}
				// biome-ignore lint/style/noNonNullAssertion: same length as releaseFrames
				yield* list[i]!;
			}),
		);
		yield* Phaser.all(branches);
		return { released: releaseFrames.length };
	});
