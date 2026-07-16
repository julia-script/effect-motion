import { Context, Latch, Layer } from "effect";
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
import type * as Camera from "./Camera";
import type * as Entity from "./Entity";
import type * as Instance from "./Instance";
import * as Phaser from "./Phaser";
import * as Runner from "./Runner";
import * as Time from "./Time";

export const TypeId = "~motion/Scene" as const;
export interface Scene<E, R> {
	readonly [TypeId]: typeof TypeId;
	readonly runner: Effect.Effect<void, E, R | Scope.Scope>;
	/** tooling-facing metadata; never read by the runtime */
	readonly annotations: Context.Context<never>;
	annotate<I, S>(key: Context.Key<I, S>, value: S): Scene<E, R>;
	annotateMerge(context: Context.Context<never>): Scene<E, R>;
}
export type AnyScene = Scene<never, never>;

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
	? Scene<E, R | Scope.Scope>
	: never => {
	return makeScene(Effect.scoped(Effect.gen(f)), Context.empty()) as never;
};

// annotate/annotateMerge return new scene values sharing the same body
const makeScene = (
	runnerEffect: Effect.Effect<void, unknown, unknown>,
	annotations: Context.Context<never>,
): object => ({
	[TypeId]: TypeId,
	runner: runnerEffect,
	annotations,
	annotate: (key: Context.Key<never, unknown>, value: unknown) =>
		makeScene(
			runnerEffect,
			Context.add(annotations, key, value) as Context.Context<never>,
		),
	annotateMerge: (context: Context.Context<never>) =>
		makeScene(runnerEffect, Context.merge(annotations, context)),
});

export const instantiate = Effect.fnUntraced(function* <
	Name extends string,
	Data extends Schema.Top,
	Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
>(
	entity: Entity.Entity<Name, Data, Traits>,
	props: Runner.InstantiateProps<Data["~type.make.in"]>,
): Effect.fn.Return<
	Instance.Instance<Name, Data, Traits>,
	never,
	Runner.Runner
> {
	const runner = yield* Runner.Runner;
	return yield* runner.instantiate(entity, props);
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
	/**
	 * builtin visibility, held beside the data; renderers skip `false`.
	 * Optional in the frame type (a hand-built frame or external producer
	 * may omit it) — absent means visible; the runner always sets it.
	 */
	$visible?: boolean;
}
export type EntriesFromEntities<Entities> = Entities extends Entity.AnyEntity
	? {
			[K in Entities as K["name"]]: FrameEntry<K>;
		}[Entities["name"]]
	: never;
export interface Frame<Entities extends Entity.AnyEntity = Entity.AnyEntity> {
	instances: Record<string, EntriesFromEntities<Entities>>;
	/** id of the root group (conventionally "root"); never rendered itself */
	root: string;
	/** render metadata from the runner settings — a frame is self-describing */
	frameRate: number;
	width: number;
	height: number;
	backgroundColor: string;
	/** the active camera's view; Camera.IDENTITY when unused */
	camera: Camera.CameraState;
}
export const step = <E, R>(runningScene: RunningScene<E, R>) =>
	Effect.gen(function* () {
		// done: the scene fiber ended. awaitedCount === 0: the body and every
		// fork completed — the scene is over even if its fiber is still
		// winding down through finalizers. Deciding here, from synchronous
		// bookkeeping, keeps frame counts deterministic: the hot frame loop
		// can starve the scene fiber for many frames, so waiting for its own
		// drain to stop backgrounds would leak extra frames.
		if (runningScene.done || runningScene.runner.awaitedCount() === 0) {
			// scene end: stop the backgrounds (including demoted tails), and
			// cut the root's own tail if the body finished-and-continued —
			// interrupting a completed fiber is a no-op, so the ordinary path
			// is unchanged (idempotent with the scene fiber's own drain)
			yield* Fiber.interruptAll(
				[...runningScene.runner.backgrounds].map((b) => b.fiber),
			);
			yield* Fiber.interrupt(runningScene.fiber);
			const exit = yield* Fiber.await(runningScene.fiber);
			// propagate a failed scene's cause instead of ending silently
			if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
				return yield* Effect.failCause(exit.cause);
			}
			// branch failures are recorded out-of-band: our interrupt may
			// have cut the scene fiber's drain before it could re-raise them
			const recorded = runningScene.runner.failureCause();
			if (recorded !== undefined) {
				return yield* Effect.failCause(recorded as Cause.Cause<E>);
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
		return (yield* runningScene.runner.state) as Frame;
	});
export interface RunningScene<E, R> {
	readonly runner: Runner.Runner["Service"];

	readonly scene: Scene<E, R>;

	readonly fiber: Fiber.Fiber<void, E>;
	readonly done: boolean;
	/** frames delivered so far — mutated by `step` for the maxFrames cap */
	framesDelivered: number;
}
export const run = <E, R>(
	scene: Scene<E, R>,
	settings: Partial<Runner.Settings> = {},
) =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner.make(settings);
		let done = false;

		// the body is itself a branch: Scene.finish inside it demotes the
		// root (count--) while the body keeps ticking as a tail
		const rootBranch = makeBranch(runner, "root");

		// Once the body can no longer tick, its party slot must go — a
		// registered-but-never-arriving root would deadlock quiescence while
		// forks drain. finishUnsafe handles count/latch (at most once, and
		// possibly already done by Scene.finish); the party goes here.
		let partyReleased = false;
		const releaseRoot = Effect.sync(() => {
			// count/latch BEFORE deregister: deregistering can synchronously
			// resume the frame consumer, which must observe consistent
			// bookkeeping or it will spin out empty frames
			rootBranch.finishUnsafe();
			if (!partyReleased) {
				partyReleased = true;
				runner.phaser.deregister(1);
			}
		});

		// Wait for every fork's SEMANTIC end (finish or completion both
		// remove it from the set; forks spawned while draining are picked up
		// by the size re-check), then stop the backgrounds — including
		// demoted tails; "scene end" includes the drain. Un-finished branch
		// failures were recorded by their own finalizers.
		const drain = Effect.gen(function* () {
			while (runner.forks.size > 0) {
				const [next] = runner.forks;
				// biome-ignore lint/style/noNonNullAssertion: size > 0
				yield* next!.finished;
			}
			yield* Fiber.interruptAll([...runner.backgrounds].map((b) => b.fiber));
			const recorded = runner.failureCause();
			if (recorded !== undefined) {
				return yield* Effect.failCause(recorded as Cause.Cause<E>);
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
							// a failed body takes everything down with it. The cause
							// is ALSO recorded out-of-band: the consumer's scene-end
							// interrupt can cut this fiber before failCause runs,
							// and the root branch records like any other branch
							onFailure: (cause) =>
								Effect.sync(() => runner.recordFailure(cause)).pipe(
									Effect.andThen(releaseRoot),
									Effect.andThen(
										Fiber.interruptAll(
											[...runner.forks, ...runner.backgrounds].map(
												(b) => b.fiber,
											),
										),
									),
									Effect.andThen(Effect.failCause(cause)),
								),
						}),
					),
				).pipe(
					Effect.ensuring(releaseRoot),
					Effect.provideService(CurrentBranch, rootBranch),
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
					Effect.forkScoped,
				);
			}),
		);

		const runningScene: RunningScene<E, R> = {
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

export const stream = <E, R>(
	scene: Scene<E, R>,
	settings: Partial<Runner.Settings> = {},
) =>
	run(scene, settings).pipe(
		Effect.map((runningScene) =>
			Stream.fromEffectRepeat(step(runningScene)).pipe(
				// refinement: the stream ends at the first null, so the
				// element type is Frame<Entities>, not Frame | null
				Stream.takeWhile((state): state is Frame => state !== null),
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

/**
 * Move `child` under `parent`, detaching it from its current parent first
 * (so it is never double-referenced). Instances are born mounted under the
 * ambient parent; `appendChild` is the explicit reparent — the door to
 * placing a lazily-created node into an existing group.
 */
export const appendChild = (
	parent: Runner.GroupInstance,
	child: Instance.Instance,
) =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner;
		runner.appendChild(parent, child);
	});

/** Detach `child` from `parent` (no-op unless it is currently its child). */
export const removeChild = (
	parent: Runner.GroupInstance,
	child: Instance.Instance,
) =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner;
		runner.removeChild(parent, child);
	});

export const settings = Effect.fnUntraced(function* () {
	const runner = yield* Runner.Runner;
	return runner.settings;
});

/**
 * The active camera instance — an ordinary instance carrying `~position`
 * (x/y pan) and a `zoom` field, so the existing animators drive it:
 * `Scene.make(function* () { const cam = yield* Scene.camera; yield*
 * cam.pipe(Motion.moveTo({ x: 400 })) })`. A default identity camera is
 * always present; animate it directly, or `Scene.setCamera` to swap in
 * another instance. The camera is never drawn.
 */
export const camera = Effect.gen(function* () {
	const runner = yield* Runner.Runner;
	return runner.camera;
});

/** Swap the active camera to `instance`; its live data becomes the view. */
export const setCamera = (instance: Instance.Instance) =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner;
		runner.setCamera(instance);
	});

// ── branches: semantic vs physical ends ────────────────────────────────

/**
 * Handle to a branch of animation (a fork, background, or played scene).
 * `finished` resolves at the branch's SEMANTIC end — `Scene.finish` or
 * completion, whichever comes first. Awaiting it from scene code HOLDS
 * the scene (the waiter keeps ticking frames, like `Scene.sleep`), so
 * the rest of the scene stays live while you wait. `fiber` is the
 * branch's physical execution — interrupt it to bound a tail.
 */
export interface BranchHandle<A = unknown, E = unknown> {
	readonly finished: Effect.Effect<void, never, Runner.Runner>;
	readonly fiber: Fiber.Fiber<A, E>;
}

interface BranchInternal {
	readonly entry: {
		fiber: Fiber.Fiber<unknown, unknown>;
		readonly finished: Effect.Effect<void>;
	};
	readonly finishUnsafe: () => void;
	readonly isFinished: () => boolean;
}

/** the innermost enclosing branch; null = outside any running scene */
const CurrentBranch = Context.Reference<BranchInternal | null>(
	"motion/Scene/CurrentBranch",
	{ defaultValue: () => null },
);

const makeBranch = (
	runner: Runner.Runner["Service"],
	kind: "fork" | "background" | "root",
): BranchInternal => {
	const latch = Latch.makeUnsafe();
	let finished = false;
	const entry = {
		// assigned immediately after forking, before anyone can observe it
		fiber: null as unknown as Fiber.Fiber<unknown, unknown>,
		finished: latch.await,
	};
	const finishUnsafe = () => {
		if (finished) {
			return;
		}
		finished = true;
		// demotion happens BEFORE the latch opens: awaiters resumed by the
		// latch must observe consistent bookkeeping
		if (kind !== "background") {
			runner.countAwaited(-1);
		}
		if (kind === "fork") {
			// fork -> background: keeps its phaser party (it may still be
			// animating), stops holding the scene open; the tail is
			// interrupted with the backgrounds at scene end
			runner.forks.delete(entry);
			runner.backgrounds.add(entry);
		}
		latch.openUnsafe();
	};
	return { entry, finishUnsafe, isFinished: () => finished };
};

/**
 * Finish the innermost enclosing branch (the current fork, played scene,
 * or the scene body itself): whoever awaits the branch's `finished`
 * proceeds, the branch stops blocking its parent's end, and the code
 * after `finish` keeps running as a TAIL — bounded by the parent, which
 * interrupts it at scene end like a background. Idempotent; completion
 * implies finish. NOTE: a failure in the tail (after finish) is NOT
 * reported — by then nothing is listening.
 */
export const finish = Effect.gen(function* () {
	const branch = yield* CurrentBranch;
	if (branch === null) {
		return yield* Effect.die(
			new Error("Scene.finish called outside a running scene"),
		);
	}
	branch.finishUnsafe();
});

// shared by fork/background/play: register the party synchronously,
// fork, record un-finished failures, finish implicitly on completion
const forkBranch = <A, E, R>(
	runner: Runner.Runner["Service"],
	effect: Effect.Effect<A, E, R>,
	kind: "fork" | "background",
) =>
	Effect.gen(function* () {
		const branch = makeBranch(runner, kind);
		if (kind === "fork") {
			// counted before the fork (no gap); undone exactly once by the
			// branch's finish/completion — synchronous with its party release
			runner.countAwaited(1);
		}
		const fiber = yield* Phaser.run(
			runner.phaser,
			effect.pipe(
				Effect.onExit((exit) =>
					Effect.sync(() => {
						// tail failures (post-finish) are deliberately dropped
						if (
							!branch.isFinished() &&
							Exit.isFailure(exit) &&
							!Cause.hasInterruptsOnly(exit.cause)
						) {
							runner.recordFailure(exit.cause);
						}
						branch.finishUnsafe();
					}),
				),
				Effect.provideService(CurrentBranch, branch),
			),
		);
		branch.entry.fiber = fiber;
		if (kind === "fork" && !branch.isFinished()) {
			runner.forks.add(branch.entry);
		} else {
			// backgrounds — and forks that completed synchronously before we
			// could track them (their demotion already targeted these sets)
			runner.backgrounds.add(branch.entry);
		}
		return {
			// the PUBLIC wait ticks while waiting: an awaiting scene fiber is
			// a phaser party and must keep arriving, or quiescence deadlocks.
			// (The internal drain awaits the latch instead — it holds no
			// party by the time it runs.)
			finished: Effect.gen(function* () {
				while (!branch.isFinished()) {
					yield* tick;
				}
			}),
			fiber,
		} as BranchHandle<A, E>;
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
): Effect.Effect<Output, E | ScheduleE, R | ScheduleR | Runner.Runner> =>
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
		return yield* forkBranch(runner, effect, "fork");
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
		return yield* forkBranch(runner, effect, "background");
	});

export interface PlayOptions {
	/** group to mount the scene's instances under (default: the root) */
	readonly parent?: Runner.GroupInstance;
	/** seed for this evaluation (default: the movie's seed) */
	readonly seed?: Runner.Seed;
}

/**
 * Play a scene as a branch of the current scene — the explicit door to
 * nesting. The child shares the movie's runner, phaser, frame rate, and
 * frame cap, and gets its own scope, branch handle, mount parent, and a
 * FRESH seeded Random stream: `play(scene)` inside a movie seeded `S`
 * animates exactly like `run(scene, { seed: S })` standalone. Awaited
 * like a fork — `yield* handle.finished` for sequential nesting, or
 * don't await for concurrent scenes.
 */
export const play = <E, R>(
	scene: Scene<E, R>,
	options?: PlayOptions,
): Effect.Effect<
	BranchHandle<void, E>,
	never,
	Runner.Runner | Exclude<R, Scope.Scope>
> =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner;
		const mounted =
			options?.parent === undefined
				? scene.runner.pipe(Effect.scoped)
				: scene.runner.pipe(
						Effect.scoped,
						Effect.provideService(Runner.CurrentParent, options.parent),
					);
		const body = mounted.pipe(
			// fresh stream per evaluation: nested playback must equal a
			// standalone run with the same seed, never inherit the parent's
			// stream position
			Random.withSeed(options?.seed ?? runner.settings.seed),
		);
		return (yield* forkBranch(
			runner,
			body as Effect.Effect<void, E, never>,
			"fork",
		)) as BranchHandle<void, E>;
	}) as never;

/**
 * Run effects in lockstep parallel, sharing frame phases — the public
 * counterpart to the low-level `Phaser.all`. Takes no schedule: pacing a
 * list sequentially belongs to {@link chain}, overlapping staggered
 * starts to {@link stagger}.
 */
export const all: typeof Phaser.all = (effects) => Phaser.all(effects);

/**
 * Run items one at a time, in order — items NEVER overlap, mirroring
 * Effect's guarantee for scheduled effects. The first item runs
 * immediately; after each item completes, `schedule` is stepped once
 * (with the item's result as input) to pace the next start. `fixed`
 * gives a start cadence with catch-up, `spaced` gives rests between
 * items. When the schedule ends early, the remaining items are skipped —
 * it is the release policy, including how many. Without a schedule,
 * plain sequential composition. Resolves with how many items completed.
 * For overlapping runs, reach for {@link stagger} or {@link fork}
 * explicitly.
 */
export const chain = <
	Eff extends Effect.Effect<any, any, any>,
	ScheduleE = never,
	ScheduleR = never,
>(
	effects: Iterable<Eff>,
	schedule?: Schedule.Schedule<
		unknown,
		Eff extends Effect.Effect<infer A, any, any> ? A : never,
		ScheduleE,
		ScheduleR
	>,
): Effect.Effect<
	{ completed: number },
	(Eff extends Effect.Effect<any, infer E, any> ? E : never) | ScheduleE,
	| (Eff extends Effect.Effect<any, any, infer R> ? R : never)
	| Runner.Runner
	| ScheduleR
> =>
	Effect.gen(function* () {
		const list = Array.from(effects);
		const runner = yield* Runner.Runner;
		const driver =
			schedule === undefined
				? undefined
				: yield* Time.scheduleDriver(schedule, runner.settings.frameRate);
		let completed = 0;
		for (const effect of list) {
			const result = yield* effect;
			completed++;
			// no step after the last item: no tail, no recurrence consumed
			if (completed === list.length || driver === undefined) {
				continue;
			}
			const decision = yield* driver.next(frameOf(runner), result);
			if (decision.done) {
				// schedule over: the remaining items are skipped
				break;
			}
			while (frameOf(runner) < decision.frame) {
				yield* tick;
			}
		}
		return { completed };
	});

/**
 * Release effects on `schedule` with OVERLAP: the first starts
 * immediately, each next one on the schedule's next emission, and
 * released effects run concurrently — semantically
 * `chain(effects.map(Scene.fork))`, but resolving when all released
 * effects finish rather than at the last release. When the schedule ends
 * early, the remaining effects are skipped. Overlap is this
 * combinator's purpose; the schedule-paced default ({@link chain})
 * never overlaps.
 */
export const stagger = <
	Eff extends Effect.Effect<any, any, any>,
	ScheduleE = never,
	ScheduleR = never,
>(
	effects: Iterable<Eff>,
	schedule: Schedule.Schedule<unknown, void, ScheduleE, ScheduleR>,
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
		const runner = yield* Runner.Runner;
		const driver = yield* Time.scheduleDriver(
			schedule,
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
