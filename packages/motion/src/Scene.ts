import { Latch, Layer } from "effect";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Random from "effect/Random";
import type * as Schedule from "effect/Schedule";
import type * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import type * as Camera from "./Camera.js";
import type * as Color from "./Color.js";
import type * as Entity from "./Entity.js";
import type * as Instance from "./Instance.js";
import * as Phaser from "./Phaser.js";
import type * as Resource from "./Resource.js";
import * as Runner from "./Runner.js";
import { Group } from "./shapes/Group.js";
import * as Time from "./Time.js";

export const TypeId = "~motion/Scene" as const;
export interface Scene<E = never, R = never> {
	readonly [TypeId]: typeof TypeId;
	/**
	 * The scene body. Loader requirements are EXCLUDED here: frames are pure
	 * of resource bytes (the engine cannot measure text), so running a scene
	 * never needs a loader — only rendering its frames does (they re-surface
	 * on `Frame<Resources>` via `~resources`).
	 */
	readonly runner: Effect.Effect<
		void,
		E,
		Resource.ExcludeLoaders<R> | Scope.Scope
	>;
	/**
	 * composition config, After Effects–style: what this comp IS. The
	 * runner inherits the ROOT scene's; a played scene keeps its own as
	 * its bounds (see {@link play}).
	 */
	readonly width: number;
	readonly height: number;
	readonly backgroundColor: Color.Color;
	/**
	 * DISPLAY-ONLY name (a picker label, never an identifier) — set via the
	 * optional leading argument of {@link make}. Names may collide; unique
	 * identity belongs to whatever registers the scene (e.g. a studio.ts
	 * record key). Never read by the runtime: playback is identical with
	 * and without a name.
	 */
	readonly name?: string;
	/** phantom: the loader members of R, carried to `Frame<Resources>` */
	readonly "~resources": Resource.ExtractLoaders<R>;
}
export type AnyScene = Scene<any, any>;
/** the loader requirements a scene's frames carry (what render will demand) */
export type Resources<S extends AnyScene> = S["~resources"];
/** the scene's failure channel */
export type Error<S extends AnyScene> =
	S extends Scene<infer E, any> ? E : never;

type GeneratorE<Eff> = [Eff] extends [never]
	? never
	: [Eff] extends [Effect.Effect<infer _A, infer E, infer _R>]
		? E
		: never;
type GeneratorR<Eff> = [Eff] extends [never]
	? never
	: [Eff] extends [Effect.Effect<infer _A, infer _E, infer R>]
		? R
		: never;

export const make: {
	<const Eff extends Effect.Effect<any, any, any>, const AEff>(
		f: () => Generator<Eff, AEff, never>,
		meta?: Partial<Runner.CompConfig>,
	): Scene<GeneratorE<Eff>, GeneratorR<Eff>>;
	<const Eff extends Effect.Effect<any, any, any>, const AEff>(
		name: string,
		f: () => Generator<Eff, AEff, never>,
		meta?: Partial<Runner.CompConfig>,
	): Scene<GeneratorE<Eff>, GeneratorR<Eff>>;
} = (first: unknown, second?: unknown, third?: unknown) => {
	type Gen = () => Generator<Effect.Effect<any, any, any>, unknown, never>;
	const [name, f, meta] =
		typeof first === "string"
			? [first, second as Gen, (third as Partial<Runner.CompConfig>) ?? {}]
			: [undefined, first as Gen, (second as Partial<Runner.CompConfig>) ?? {}];
	return makeScene(Effect.scoped(Effect.gen(f)), meta, name);
};

const makeScene = <E = never, R = never>(
	runnerEffect: Effect.Effect<void, E, R>,
	meta: Partial<Runner.CompConfig>,
	name?: string,
): Scene<E, R> => ({
	[TypeId]: TypeId,

	// THE erasure seam (design D3): loader requirements in R are phantom —
	// authored yields never dereference their tags — so the body is safe to
	// run with only ExcludeLoaders<R>. Guarded by the loader-free-run test.
	runner: runnerEffect as Effect.Effect<
		void,
		E,
		Resource.ExcludeLoaders<R> | Scope.Scope
	>,
	"~resources": undefined as never,

	...(name !== undefined ? { name } : {}),
	width: meta.width ?? Runner.defaultComp.width,
	height: meta.height ?? Runner.defaultComp.height,
	backgroundColor: meta.backgroundColor ?? Runner.defaultComp.backgroundColor,
});

export const instantiate = Effect.fnUntraced(function* <
	Name extends string,
	Data extends Schema.Struct.Fields,
	Traits extends Entity.PartialTraits<Data>,
>(
	entity: Entity.Entity<Name, Data, Traits>,
	props: Runner.InstantiateProps<Data>,
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

export interface FrameEntry {
	data: Entity.AnyEntity["data"]["Type"];
	entity: Entity.AnyEntity;
}

export interface Frame<out Resources = never> {
	/**
	 * phantom: the loader requirements `Renderer.render` will demand for this
	 * frame. Never a runtime value — an unused type parameter would be
	 * structurally erased, so it must anchor on an (always-absent) field.
	 */
	readonly "~resources"?: Resources;
	instances: Record<string, FrameEntry>;
	/** id of the root group (conventionally "root"); never rendered itself */
	root: string;
	/** render metadata — frameRate from the runner settings, resolution and
	 * background from the ROOT scene's comp config; a frame is self-describing */
	frameRate: number;
	width: number;
	height: number;
	backgroundColor: Color.Color;
	/** the active camera's view; Camera.IDENTITY when unused */
	camera: Camera.CameraState;
}
// R is never: everything step touches is bound to the runningScene value
// (runner instance, phaser, fiber) — no ambient service is read
export const step = Effect.fnUntraced(function* <E, R>(
	runningScene: RunningScene<E, R>,
): Effect.fn.Return<Frame<Resource.ExtractLoaders<R>> | null, E, never> {
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
	return yield* runningScene.runner.state;
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
		// the runner inherits the ROOT scene's composition config
		const runner = yield* Runner.Runner.make(settings, {
			width: scene.width,
			height: scene.height,
			backgroundColor: scene.backgroundColor,
		});
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
					Effect.provideService(currentBranch<void, never>(), rootBranch),
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

export const stream = <E = never, R = never>(
	scene: Scene<E, R>,
	settings: Partial<Runner.Settings> = {},
) =>
	run(scene, settings).pipe(
		Effect.map((runningScene) =>
			Stream.fromEffectRepeat(step(runningScene)).pipe(
				// refinement: the stream ends at the first null, so the
				// element type is Frame<Entities>, not Frame | null
				Stream.takeWhile((state) => state !== null),
			),
		),
		Stream.unwrap,
	);

type Updater<Data> = Data | ((data: Data) => Data);
const isUpdaterFn = <Data>(
	props: Updater<Data>,
): props is (data: Data) => Data => typeof props === "function";

export const data = <
	Name extends string,
	Data extends Schema.Struct.Fields,
	Traits extends Entity.PartialTraits<Data>,
>(
	instance: Instance.Instance<Name, Data, Traits>,
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
export const update = <
	Name extends string,
	Data extends Schema.Struct.Fields,
	Traits extends Entity.PartialTraits<Data>,
>(
	instance: Instance.Instance<Name, Data, Traits>,
	props: Updater<Entity.EntityData<Data>["Type"]>,
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

/** the movie's composition config — the ROOT scene's width/height/background */
export const comp = Effect.fnUntraced(function* () {
	const runner = yield* Runner.Runner;
	return runner.comp;
});

/**
 * The active camera instance — an ordinary instance carrying `~position`
 * (world x/y/z), Euler orientation (`rotX`/`rotY`/`rotZ`), and
 * `focalLength` (perspective strength — see Projection.defaultFocalLength),
 * so the existing animators drive it: `Scene.make(function* () { const cam
 * = yield* Scene.camera; yield* cam.pipe(Motion.moveTo({ z: -400 })) })`.
 * A default resting camera is always present (width-relative 50mm-equivalent
 * focal length, projecting z=0 content to plain-2D placement); animate it
 * directly, or `Scene.setCamera` to swap in another instance. The camera is
 * never drawn.
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
export interface BranchHandle<A = unknown, E = never> {
	readonly finished: Effect.Effect<void, never, Runner.Runner>;
	readonly fiber: Fiber.Fiber<A, E>;
}

interface BranchInternal<A, E = never> {
	readonly entry: {
		fiber: Fiber.Fiber<A, E>;
		readonly finished: Effect.Effect<void>;
	};
	readonly finishUnsafe: () => void;
	readonly isFinished: () => boolean;
}

/** the innermost enclosing branch; null = outside any running scene */
const currentBranch = <A, E = never>() =>
	Context.Reference<BranchInternal<A, E> | null>("motion/Scene/CurrentBranch", {
		defaultValue: () => null,
	});

const makeBranch = <A, E = never>(
	runner: Runner.Runner["Service"],
	kind: "fork" | "background" | "root",
): BranchInternal<A, E> => {
	const latch = Latch.makeUnsafe();
	let finished = false;
	const entry = {
		// assigned immediately after forking, before anyone can observe it
		fiber: null as unknown as Fiber.Fiber<A, E>,
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
	const branch = yield* currentBranch<void, never>();
	if (branch === null) {
		return yield* Effect.die(
			new Error("Scene.finish called outside a running scene"),
		);
	}
	branch.finishUnsafe();
});

// shared by fork/background/play: register the party synchronously,
// fork, record un-finished failures, finish implicitly on completion
const forkBranch = <A, E = never, R = never>(
	runner: Runner.Runner["Service"],
	effect: Effect.Effect<A, E, R>,
	kind: "fork" | "background",
) =>
	Effect.gen(function* () {
		const branch = makeBranch<A, E>(runner, kind);
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
				Effect.provideService(currentBranch<A, E>(), branch),
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
export const fork = <A, E = never, R = never>(effect: Effect.Effect<A, E, R>) =>
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
export const background = <A, E = never, R = never>(
	effect: Effect.Effect<A, E, R>,
) =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner;
		return yield* forkBranch(runner, effect, "background");
	});

export interface PlayOptions {
	/** group to mount the child's bounds group under (default: the ambient parent) */
	readonly parent?: Runner.GroupInstance;
	/** seed for this evaluation (default: the movie's seed) */
	readonly seed?: Runner.Seed;
}

/**
 * A played scene's branch handle plus its mount group — the child comp as
 * one unit. Move/fade the group (trait lenses) or scale it (transform
 * operations) to transform the whole nested scene, bounds included.
 */
export interface PlayHandle<A = void, E = never> extends BranchHandle<A, E> {
	readonly group: Runner.GroupInstance;
}

/**
 * Play a scene as a branch of the current scene — the explicit door to
 * nesting, After Effects–precomp-style. The child shares the movie's
 * runner, phaser, frame rate, and frame cap, and gets its own scope,
 * branch handle, and a FRESH seeded Random stream: `play(scene)` inside a
 * movie seeded `S` animates exactly like `run(scene, { seed: S })`
 * standalone. Each evaluation mounts the child under an implicit group
 * carrying the child scene's bounds (width/height/backgroundColor):
 * content clips to them, a non-transparent background paints within them,
 * and the group is placed so the child's bounds CENTER in the enclosing
 * comp (the movie, or the enclosing played scene) — a child smaller or
 * bigger than the movie renders centered. Awaited like a fork —
 * `yield* handle.finished` for sequential nesting, or don't await for
 * concurrent scenes.
 */
export const play = <E, R>(
	scene: Scene<E, R>,
	options?: PlayOptions,
): Effect.Effect<
	PlayHandle<void, E>,
	never,
	Runner.Runner | Exclude<R, Scope.Scope>
> =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner;
		// default placement: the child's bounds centered in the enclosing
		// comp — the ambient (or explicit) parent's bounds when it is a
		// sized group, the movie's comp at the root. An unsized parent
		// group has no bounds to center in; the child mounts at its origin.
		const ambient = options?.parent ?? (yield* Runner.CurrentParent);
		const enclosing = (() => {
			if (ambient === null) {
				return runner.comp;
			}
			const data = runner.getDataUnsafe(ambient) as {
				width?: number;
				height?: number;
			} | null;
			return data !== null &&
				typeof data.width === "number" &&
				typeof data.height === "number"
				? { width: data.width, height: data.height }
				: null;
		})();
		// the child's comp bounds ride on the mount group: the renderer clips
		// the subtree to them and paints the child's background within them
		const group = yield* runner
			.instantiate(Group, {
				x: enclosing === null ? 0 : (enclosing.width - scene.width) / 2,
				y: enclosing === null ? 0 : (enclosing.height - scene.height) / 2,
				width: scene.width,
				height: scene.height,
				backgroundColor: scene.backgroundColor,
			})
			.pipe(Effect.provideService(Runner.CurrentParent, ambient));
		const body = scene.runner.pipe(
			Effect.scoped,
			// the child's instances mount under its bounds group
			Effect.provideService(Runner.CurrentParent, group),
			// fresh stream per evaluation: nested playback must equal a
			// standalone run with the same seed, never inherit the parent's
			// stream position
			Random.withSeed(options?.seed ?? runner.settings.seed),
		);
		const handle = (yield* forkBranch(
			runner,
			body as Effect.Effect<void, E, never>,
			"fork",
		)) as BranchHandle<void, E>;
		return { ...handle, group } satisfies PlayHandle<void, E>;
	}) as never;

/**
 * Run effects in lockstep parallel, sharing frame phases — the public
 * counterpart to the low-level `Phaser.all`. Takes no schedule: pacing a
 * list sequentially belongs to {@link chain}, overlapping staggered
 * starts to {@link stagger}.
 */
export const all = Effect.fnUntraced(function* <
	Eff extends Effect.Effect<any, any, any>,
>(effects: Iterable<Eff>) {
	const runner = yield* Runner.Runner;
	// runner.phaser
	return yield* Phaser.all(effects).pipe(
		Effect.provideService(Phaser.Phaser, runner.phaser),
	);
});

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
		yield* Phaser.all(branches).pipe(
			Effect.provideService(Phaser.Phaser, runner.phaser),
		);
		return { released: releaseFrames.length };
	});
