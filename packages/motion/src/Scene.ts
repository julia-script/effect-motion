/**
 * Authoring and running scenes — the module you start from.
 *
 * @remarks
 * A scene is a generator function that creates entities and yields
 * animations. It is a pure description: running it twice produces the same
 * frames, because scene time is counted in FRAMES rather than read from a
 * clock, and randomness comes from a seeded generator.
 *
 * The surface divides into three jobs:
 *
 * - **Authoring** — {@link make} to declare a scene, {@link instantiate} to
 *   put something in it, {@link sleep} to hold, {@link data} / {@link update}
 *   to read and write entity state directly.
 * - **Composition** — {@link all} (together), {@link chain} (one after
 *   another), {@link stagger} (overlapping), {@link repeat} (again, on a
 *   schedule), {@link fork} / {@link background} (alongside), {@link play}
 *   (a whole scene nested inside another).
 * - **Consumption** — {@link run} to start one, {@link stream} to pull its
 *   frames lazily, {@link step} to advance it a frame at a time.
 *
 * Concurrency is frame-synchronized. Animations running "at the same time"
 * all advance exactly one frame per tick and wait for each other at a
 * barrier, so adding concurrency never changes the frames a scene produces —
 * only how they are written.
 *
 * @example
 * A complete scene: two shapes, one moving after the other.
 * ```typescript
 * import * as Motion from "effect-motion/Motion";
 * import * as Scene from "effect-motion/Scene";
 *
 * const scene = Scene.make(
 * 	function* () {
 * 		const dot = yield* Scene.instantiate("Circle", { radius: 20 });
 * 		yield* dot.pipe(Motion.moveTo({ x: 400 }, "1 second"));
 * 	},
 * 	{ width: 500, height: 300 },
 * );
 * ```
 */
import { Latch, Layer } from "effect";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Random from "effect/Random";
import type * as Schedule from "effect/Schedule";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import type * as Color from "./Color.js";
import * as Entity from "./Entity.js";
import type * as Instance from "./Instance.js";
import * as Phaser from "./Phaser.js";
import type * as Projection from "./Projection.js";
import type * as Resource from "./Resource.js";
import * as Runner from "./Runner.js";
import * as Time from "./Time.js";

export const TypeId = "~motion/Scene" as const;

/**
 * A scene: an animation body plus the composition it plays in.
 *
 * @remarks
 * Inert on its own — building one runs no animation and produces no frames.
 * It is a description that {@link run}, {@link stream}, or {@link play}
 * later executes, which is what lets the same scene be replayed, nested, or
 * rendered at different settings without change.
 *
 * @typeParam E - How the scene can fail.
 * @typeParam R - What it needs to run (fonts, images, and other resources).
 */
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

/**
 * Declare a scene from a generator body.
 *
 * @remarks
 * The generator is where a scene is written: `yield*` an
 * {@link instantiate} to create something, `yield*` an animator to move it.
 * Yielding is what makes time pass — statements between yields all happen on
 * the same frame.
 *
 * The body does NOT run here. `make` captures it, so a scene can be
 * declared once at module scope and run many times; each run re-executes
 * the body from scratch with fresh entities.
 *
 * `meta` sets what the composition IS — its pixel dimensions and background.
 * That is distinct from playback settings like frame rate and seed, which
 * are chosen later at {@link run} / {@link stream}, because the same scene
 * may legitimately be played back at different rates.
 *
 * An optional leading `name` is a display label for pickers and tooling
 * only; it is never read during playback.
 *
 * @param f - The scene body.
 * @param meta - Composition config: `width`, `height`, `backgroundColor`.
 * @defaultValue `meta` — 1920×1080, transparent background
 * @returns An inert {@link Scene}, ready to run, stream, or play.
 *
 * @example
 * A named 500×300 scene on a dark background.
 * ```typescript
 * const scene = Scene.make(
 * 	"intro",
 * 	function* () {
 * 		const dot = yield* Scene.instantiate("Circle", { radius: 20 });
 * 		yield* dot.pipe(Motion.moveTo({ x: 400 }, "1 second"));
 * 	},
 * 	{ width: 500, height: 300, backgroundColor: Color.hex("#16161d") },
 * );
 * ```
 */
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

/**
 * Create an entity and put it in the scene.
 *
 * @remarks
 * `kind` selects the entity and, with it, the exact props allowed — asking
 * for a `"Circle"` gets you `radius`, a `"Text"` gets `text` and
 * `fontSize`. Everything is optional and defaulted, so `instantiate("Circle",
 * {})` is a valid white circle at the origin.
 *
 * The entity appears immediately and stays for the rest of the scene. It is
 * mounted under the ambient parent — the root, or the enclosing Group when
 * created inside one.
 *
 * What you get back is a lightweight HANDLE, not the entity's data. It is
 * what animators take, and it stays valid as the data changes underneath;
 * to read the current state use {@link data}. Because the handle is itself
 * pipeable, you can animate straight off the call without binding it first.
 *
 * Containers (`Group`, `Hud`) accept a `children` array that is deliberately
 * permissive: a bare string becomes a Text, an existing handle is adopted,
 * and an un-yielded `instantiate` is resolved for you.
 *
 * @param kind - Which entity: `"Circle"`, `"Rect"`, `"Text"`, `"Line"`,
 *   `"Path"`, `"Ellipse"`, `"Group"`, `"Hud"`, `"Image"`, or `"Camera"`.
 * @param props - Initial field values; all optional.
 * @returns A handle to the live entity.
 *
 * @example
 * A shape, and a Group adopting mixed children.
 * ```typescript
 * const dot = yield* Scene.instantiate("Circle", {
 * 	position: Entity.vec3({ x: 100, y: 50 }),
 * 	radius: 20,
 * 	fillColor: Color.hex("#7f5af0"),
 * });
 *
 * const panel = yield* Scene.instantiate("Group", {
 * 	children: [
 * 		"a bare string becomes a Text",
 * 		Scene.instantiate("Rect", { width: 200, height: 40 }),
 * 		dot,
 * 	],
 * });
 * ```
 */
export const instantiate = Effect.fnUntraced(function* <
	Tag extends Entity.EntityTag,
>(
	kind: Tag,
	props: Runner.InstantiateProps<Tag>,
): Effect.fn.Return<Instance.Instance<Tag>, never, Runner.Runner> {
	const runner = yield* Runner.Runner;

	return yield* runner.instantiate(kind, props);
});

export const tick = Effect.gen(function* () {
	const runner = yield* Runner.Runner;
	return yield* runner.phaser.arriveAndAwaitAdvance;
});

/**
 * Hold the scene still for `duration`.
 *
 * @remarks
 * `Effect.sleep`'s sibling, but counted in FRAMES at the runner's frame
 * rate rather than read from a clock. That distinction is load-bearing:
 * a wall-clock sleep would produce a different number of frames on a slow
 * machine, and scenes must be reproducible.
 *
 * A zero-length duration is a no-op — unlike an animator, which always
 * consumes at least one frame.
 *
 * Use `Motion.wait` instead when the hold belongs inside an animator chain.
 *
 * @param duration - How long to hold, in scene time.
 *
 * @example
 * ```typescript
 * yield* Scene.sleep("500 millis");
 * ```
 */
export const sleep = (duration: Duration.Input) =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner;
		const frames = Time.toFrames(duration, runner.settings.frameRate);
		for (let i = 0; i < frames; i++) {
			yield* tick;
		}
	});

/**
 * One instance as a frame carries it. The entity DEFINITION is gone: `data`
 * is a member of the closed union, so `data._tag` is the identity and the
 * renderer narrows on it instead of dispatching on an entity object.
 */
export interface FrameEntry {
	data: Entity.Entity;
}

/**
 * One rendered moment: every entity's state at a single instant, plus the
 * metadata needed to draw it.
 *
 * @remarks
 * A frame is self-describing — it carries its own resolution, background,
 * frame rate, and camera view, so a renderer needs nothing but the frame to
 * produce a picture. That is what lets frames be serialized, cached, or sent
 * to a different process.
 *
 * `instances` is keyed by instance id and holds plain data, not handles. The
 * active camera is deliberately absent from it (it is view state, surfaced
 * as `camera` instead), and `root` names the group everything hangs from,
 * which is never itself drawn.
 *
 * @typeParam Resources - Fonts and images the renderer will need; frames
 *   carry the requirement, never the bytes.
 */
export interface Frame<out Resources = never> {
	/**
	 * phantom: the loader requirements the renderer will demand for this
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
	/** the active camera's view; the resting view when unused */
	camera: Projection.CameraView & Projection.PointOfInterest;
	/**
	 * Mounted scenes (`Scene.play`), keyed by the id of the group they mount
	 * under. Each is a render-to-texture boundary: the renderer draws the
	 * subtree to its own target at these bounds, under an identity camera,
	 * and composites the result. An id absent here is a plain group.
	 */
	comps: Record<string, Runner.CompConfig>;
}
/**
 * Advance a running scene by exactly one frame.
 *
 * @remarks
 * Returns the frame that was produced, or `null` once the scene is over —
 * which is the signal to stop pulling. Every concurrent branch advances
 * together on each call, which is what keeps concurrency from affecting the
 * frames a scene produces.
 *
 * A scene that runs past its `maxFrames` cap dies here with a message
 * naming the limit, rather than looping forever — the guard against an
 * accidental `Schedule.forever` with nothing to stop it.
 *
 * @param runningScene - The handle from {@link run}.
 * @returns The next frame, or `null` when the scene has ended.
 */
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
	// The end-check above reads bookkeeping that the scene fiber writes, and
	// on the very first step that fiber has not been scheduled yet: the body
	// may still spawn branches and finish before producing anything. A body
	// whose only statement is `Scene.background` does exactly that — it
	// registers a phaser party (synchronously, in Phaser.run) and returns, so
	// the advance we are about to await can never complete: the root has
	// deregistered and the background will never arrive. Racing the scene
	// fiber closes that window without teaching the phaser about branch kinds.
	// After the first advance the fiber is running and the race is already
	// settled, so this costs nothing on the hot path.
	const advanced = yield* Effect.raceFirst(
		runningScene.runner.phaser.awaitAdvance.pipe(Effect.as(true)),
		Fiber.await(runningScene.fiber).pipe(Effect.as(false)),
	);
	if (!advanced) {
		// the scene ended before this frame could advance — re-run the end
		// path, which owns failure propagation and background teardown
		return yield* step(runningScene);
	}
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
/**
 * Start a scene and hand back a handle for advancing it manually.
 *
 * @remarks
 * The low-level entry point, for drivers that need to own the frame loop —
 * an exporter writing files, or a player synchronizing to its own clock.
 * Starting a scene does not produce any frames; pair this with {@link step}
 * to pull them one at a time.
 *
 * Most code wants {@link stream} instead, which wraps exactly this pairing
 * in a stream.
 *
 * @param scene - The scene to start.
 * @param settings - Playback settings.
 * @returns A running-scene handle to pass to {@link step}.
 *
 * @example
 * ```typescript
 * const running = yield* Scene.run(scene, { frameRate: 30 });
 * let frame = yield* Scene.step(running);
 * while (frame !== null) {
 * 	frame = yield* Scene.step(running);
 * }
 * ```
 */
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

/**
 * Play a scene and get its frames as a lazy stream — the usual way to
 * consume one.
 *
 * @remarks
 * Frames are produced on demand, so a player can pull at its own pace and a
 * long scene never has to be materialized all at once. The stream ends when
 * the scene does.
 *
 * `settings` is where playback choices live — `frameRate`, `seed`,
 * `maxFrames` — as opposed to what the composition IS (its size and
 * background), which was fixed at {@link make}. The same scene can therefore
 * be streamed at 30fps for a preview and 60fps for a final render without
 * being rewritten.
 *
 * Note the frame count depends on the frame rate: a one-second animation is
 * 30 frames at 30fps and 60 at 60fps, plus a final resting frame.
 *
 * @param scene - The scene to play.
 * @param settings - Playback settings.
 * @defaultValue `frameRate` 60, `seed` `"effect-motion"`, `maxFrames` 36_000
 * @returns A stream of frames.
 *
 * @example
 * Collect every frame of a scene at 30fps.
 * ```typescript
 * const frames = yield* Scene.stream(scene, { frameRate: 30 }).pipe(
 * 	Stream.runCollect,
 * );
 * ```
 */
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

/**
 * Read an entity's current data.
 *
 * @remarks
 * An {@link Instance} is only a handle, so this is how you get at the live
 * values behind it — to branch on where something is, or to compute a target
 * relative to its current state.
 *
 * The result is a snapshot for THIS frame, not a live view; read again on a
 * later frame to see later values. The returned type is narrowed by the
 * handle's kind, so a Circle's `radius` is available without casting.
 *
 * Reading a destroyed entity is a loud defect rather than a silent
 * `undefined`.
 *
 * @param instance - Handle to read.
 * @returns The entity's data as of this frame.
 * @see {@link update} to write it.
 *
 * @example
 * ```typescript
 * const { position, radius } = yield* Scene.data(dot);
 * yield* dot.pipe(Motion.moveTo({ x: position.x + radius * 4 }, "1 second"));
 * ```
 */
export const data = <Tag extends Entity.EntityTag>(
	instance: Instance.Instance<Tag>,
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
/**
 * Set an entity's data immediately, with no animation.
 *
 * @remarks
 * A hard cut on the current frame — the counterpart to the animators, which
 * interpolate. Use it to set something up before animating (jolt the camera,
 * then spring it back), or to change a field no animator covers, like
 * `text`, `visible`, or a Path's `commands`.
 *
 * Pass an object to replace the data, or a function to derive it from the
 * current values — the function form is preferred, since it reads and writes
 * atomically.
 *
 * Updating a destroyed entity is a no-op returning `false`, not an error.
 *
 * @param instance - Handle to update.
 * @param props - New data, or `(current) => next`.
 *
 * @example
 * Retitle a label and jolt the camera, both on this frame.
 * ```typescript
 * yield* Scene.update(label, (d) => ({ ...d, text: "done" }));
 * yield* Scene.update(camera, (d) => ({
 * 	...d,
 * 	position: Entity.vec3({ ...d.position, x: 22 }),
 * }));
 * ```
 */
export const update = <Tag extends Entity.EntityTag>(
	instance: Instance.Instance<Tag>,
	props: Updater<Entity.EntityByTag<Tag>>,
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
 * The active camera, as an ordinary animatable instance.
 *
 * @remarks
 * There is always a camera — a resting one is present from the first frame,
 * placed so that content at `z = 0` renders exactly as flat 2D. A scene that
 * never touches the camera looks like a plain 2D scene, and reaching for
 * `Scene.camera` is how you opt into depth.
 *
 * It is a normal instance, so every animator drives it with no special
 * vocabulary: `moveTo` flies it (including along `z` to push in or pull
 * back), `tweenTo` on `focalLength` changes the lens, springs and forks work
 * as they do anywhere. `Camera` helpers add aiming on top.
 *
 * The camera is view state and is never itself drawn.
 *
 * @returns A handle to the active camera.
 * @see {@link setCamera} to swap in a different one.
 *
 * @example
 * Push the camera in, revealing depth in the scene.
 * ```typescript
 * const camera = yield* Scene.camera;
 * yield* camera.pipe(Motion.moveTo({ z: -300 }, "1200 millis", "easeInOutCubic"));
 * ```
 */
export const camera = Effect.gen(function* () {
	const runner = yield* Runner.Runner;
	return runner.camera;
});

/** Swap the active camera to `instance`; its live data becomes the view. */
export const setCamera = (instance: Instance.Instance<"Camera">) =>
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
 * Declare the current branch semantically over, while its code keeps
 * running.
 *
 * @remarks
 * Separates "this is done as far as everyone else is concerned" from "this
 * fiber has stopped". Anyone awaiting the branch's `finished` proceeds
 * immediately, and the branch stops holding the scene open — but code after
 * `finish` keeps running as a TAIL, bounded by the parent exactly like a
 * {@link background}.
 *
 * The use is a beat that should hand off early: an entrance whose successor
 * starts as soon as the element has landed, while a slow ring-out continues
 * underneath. Without `finish`, the successor would wait for the tail.
 *
 * Idempotent, and completion implies finish. Note that a failure in the tail
 * is NOT reported — by then nothing is listening.
 *
 * Calling it outside a running scene is a loud defect.
 *
 * @example
 * Hand off after the landing; the wobble plays on borrowed time.
 * ```typescript
 * yield* Scene.fork(
 * 	Effect.gen(function* () {
 * 		yield* badge.pipe(Motion.moveTo({ y: 100 }, "400 millis"));
 * 		yield* Scene.finish;
 * 		yield* badge.pipe(Physics.springTo({ y: 96 }, "bounce"));
 * 	}),
 * );
 * ```
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
 * Play an animation again and again, on a schedule.
 *
 * @remarks
 * `Effect.repeat`'s sibling, paced by FRAMES rather than the wall clock —
 * which is what keeps a looping scene deterministic.
 *
 * The first run happens immediately, and the schedule paces the gaps AFTER
 * each run. So `Schedule.spaced("400 millis")` means "run, rest 400ms, run
 * again", and the loop count comes from the schedule: `Schedule.forever`
 * for ambient motion (usually inside {@link background}), or
 * `Schedule.upTo({ times: 2 })` for a bounded three-run sequence.
 *
 * A failing run fails immediately, without consulting the schedule again.
 *
 * @param effect - The animation to repeat.
 * @param schedule - How often, and how many times.
 * @returns The schedule's final output.
 *
 * @example
 * Three round-trips, resting 400ms between them.
 * ```typescript
 * yield* Scene.repeat(
 * 	ball.pipe(
 * 		Motion.moveTo({ x: 430 }, "600 millis", "easeInOutCubic"),
 * 		Motion.moveTo({ x: 70 }, "600 millis", "easeInOutCubic"),
 * 	),
 * 	Schedule.spaced("400 millis").pipe(Schedule.upTo({ times: 2 })),
 * );
 * ```
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
 * Start an animation alongside the rest of the scene and continue
 * immediately, without waiting for it.
 *
 * @remarks
 * Where {@link all} blocks until its branches finish, `fork` returns at
 * once — so the scene body carries on while the forked animation plays.
 * That is what lets independent timelines overlap, and what makes spawning
 * work in a loop possible.
 *
 * Note this INVERTS Effect's own `fork`: the scene's end waits for forked
 * work. A body that returns while forks are still animating keeps producing
 * frames until the last one finishes, so a scene consisting only of a fork
 * still plays in full. For work that should instead be cut off when the
 * scene ends, use {@link background}.
 *
 * The returned handle carries `finished` — yield it to wait for this branch
 * specifically — and `fiber`, to interrupt it early.
 *
 * @param effect - The animation to run alongside.
 * @returns A handle with `finished` and `fiber`.
 * @see {@link background} for work bounded by the scene's end.
 *
 * @example
 * Spawn overlapping dots; the scene lives until the last one has faded.
 * ```typescript
 * yield* Scene.repeat(
 * 	Scene.fork(
 * 		Effect.gen(function* () {
 * 			const dot = yield* Scene.instantiate("Circle", { radius: 8 });
 * 			yield* dot.pipe(
 * 				Motion.moveTo({ x: 440 }, "1200 millis"),
 * 				Motion.fadeTo(0, "300 millis"),
 * 			);
 * 		}),
 * 	),
 * 	Schedule.fixed("200 millis").pipe(Schedule.upTo({ times: 5 })),
 * );
 * ```
 */
export const fork = <A, E = never, R = never>(effect: Effect.Effect<A, E, R>) =>
	Effect.gen(function* () {
		const runner = yield* Runner.Runner;
		return yield* forkBranch(runner, effect, "fork");
	});

/**
 * Like {@link fork}, but the animation is CUT OFF at scene end rather than
 * awaited.
 *
 * @remarks
 * For ambient motion that should play for as long as the scene lasts
 * without deciding how long that is — a pulsing indicator, a drifting
 * backdrop, anything paired with `Schedule.forever`. A background never
 * holds the scene open, so the scene's real content governs its length and
 * the ambient loop simply stops when everything else is done.
 *
 * "Scene end" includes the fork drain: backgrounds keep animating while
 * awaited forks finish, and are stopped only after the last one.
 *
 * Because backgrounds do not keep a scene alive, a body that spawns only
 * backgrounds ends immediately and produces NO frames — the background is
 * not content, so there is nothing to give the scene a length. Pair one
 * with something that does define the length, whether a real animation or
 * an explicit {@link sleep}, or the ambient motion never gets a frame to
 * play on.
 *
 * @param effect - The ambient animation.
 * @returns A handle with `finished` and `fiber`.
 *
 * @example
 * A pulse that runs the whole scene, with the scene's length set by the
 * animation after it.
 * ```typescript
 * yield* Scene.background(
 * 	Scene.repeat(
 * 		pulse.pipe(
 * 			Motion.tweenTo({ radius: 24 }, "400 millis"),
 * 			Motion.tweenTo({ radius: 10 }, "400 millis"),
 * 		),
 * 		Schedule.forever,
 * 	),
 * );
 * yield* title.pipe(Motion.moveTo({ y: 100 }, "2 seconds"));
 * ```
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
 * A played scene's handle: its branch, plus the group it is mounted under.
 *
 * @remarks
 * `group` is what makes a nested scene manipulable as ONE object — move,
 * fade, or scale it and the entire child scene follows, its bounds included.
 */
export interface PlayHandle<A = void, E = never> extends BranchHandle<A, E> {
	readonly group: Runner.GroupInstance;
}

/**
 * Nest a whole scene inside the current one — the precomp.
 *
 * @remarks
 * The door to composing scenes rather than writing one flat timeline. A
 * played scene is authored and tested independently, then dropped into a
 * larger one as a unit: an intro built alone becomes the first beat of a
 * longer piece without edits.
 *
 * The child mounts under an implicit group carrying its OWN bounds. Content
 * clips to them, a non-transparent background paints within them, and the
 * group is placed so those bounds sit centered in the enclosing composition
 * — so a child smaller or larger than its parent still lands sensibly. The
 * handle's `group` is that mount point: move or fade it to transform the
 * entire nested scene as one object.
 *
 * The child shares the movie's frame clock but gets a FRESH seeded random
 * stream, so a nested scene animates exactly as it did standalone under the
 * same seed — nesting never perturbs a child's randomness.
 *
 * Awaited like a {@link fork}: yield `handle.finished` to play children in
 * sequence, or skip the await to run them concurrently.
 *
 * @param scene - The scene to nest.
 * @param options - `parent` to mount elsewhere, `seed` to vary this
 *   evaluation.
 * @returns A handle with `finished`, `fiber`, and the mount `group`.
 *
 * @example
 * Play one scene, then another, and fade the second out as a whole.
 * ```typescript
 * const intro = yield* Scene.play(introScene);
 * yield* intro.finished;
 *
 * const outro = yield* Scene.play(outroScene);
 * yield* outro.group.pipe(Motion.fadeTo(0, "500 millis"));
 * ```
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
		// the bounds to center in: the enclosing comp's when the ambient parent
		// is itself a mounted scene, the movie's comp at the root. A parent
		// that is a plain group has no bounds; the child mounts at its origin.
		const enclosing =
			ambient === null ? runner.comp : runner.compBounds(ambient.id);
		// A mounted scene is a render-to-texture boundary: the renderer clips
		// its subtree to the child's bounds and paints the child's background
		// within them. Those bounds are the SCENE's, so they are registered
		// against the mount group's id rather than copied onto it as fields —
		// a Group that happens to carry a size is not what makes a comp.
		const group = yield* runner
			.instantiate("Group", {
				position: Entity.vec3({
					x: enclosing === null ? 0 : (enclosing.width - scene.width) / 2,
					y: enclosing === null ? 0 : (enclosing.height - scene.height) / 2,
				}),
			})
			.pipe(Effect.provideService(Runner.CurrentParent, ambient));
		runner.registerComp(group.id, {
			width: scene.width,
			height: scene.height,
			backgroundColor: scene.backgroundColor,
		});
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
 * Run animations simultaneously, and resolve when the last one finishes.
 *
 * @remarks
 * The everyday way to make things move at once. Every branch advances
 * exactly one frame per tick in lockstep, so two one-second animations run
 * as one second of frames — not two.
 *
 * Branches need not be the same length; `all` waits for the slowest. This
 * is also the idiom for synchronizing springs, whose durations are emergent
 * and unknown up front.
 *
 * There is deliberately no schedule parameter: pacing a list one-at-a-time
 * is {@link chain}, and overlapping starts is {@link stagger}.
 *
 * @param effects - The animations to run together.
 *
 * @example
 * A dot slides while the camera pushes in — one second of frames total.
 * ```typescript
 * yield* Scene.all([
 * 	dot.pipe(Motion.moveTo({ x: 400 }, "1 second")),
 * 	camera.pipe(Motion.moveTo({ z: -300 }, "1 second")),
 * ]);
 * ```
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
 * Run animations one at a time, in order, optionally resting between them.
 *
 * @remarks
 * Items NEVER overlap — each begins only after the previous one has fully
 * finished. That guarantee is the difference between this and
 * {@link stagger}, and it holds no matter what schedule you pass.
 *
 * Without a schedule this is plain sequencing, equivalent to yielding each
 * item in turn but composable as a list. With one, the schedule paces the
 * GAPS after each item: `Schedule.spaced("400 millis")` rests 400ms between
 * items, while `Schedule.fixed` targets a steady start-to-start cadence.
 *
 * The schedule also decides how many items run: when it ends, the remaining
 * items are skipped. `Schedule.recurs(2)` therefore plays three items — the
 * first, plus two more the schedule released.
 *
 * @param effects - The animations, in order.
 * @param schedule - Optional pacing for the gaps between them.
 * @returns `{ completed }` — how many items actually ran.
 *
 * @example
 * Three shapes flashing in turn, resting 400ms between each.
 * ```typescript
 * const { completed } = yield* Scene.chain(
 * 	[a, b, c].map((shape) => shape.pipe(Motion.fadeTo(1, "300 millis"))),
 * 	Schedule.spaced("400 millis"),
 * );
 * ```
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
 * Start animations one after another WITHOUT waiting for each to finish —
 * the cascade.
 *
 * @remarks
 * The first starts immediately and each next one on the schedule's next
 * emission, so earlier items are still running when later ones begin. That
 * overlap is the entire point, and the difference from {@link chain}: use
 * `stagger` for a ripple across many elements, `chain` when items must not
 * coincide.
 *
 * The schedule paces the STARTS here, not the gaps. Resolution waits for
 * every released animation to finish, not merely for the last one to be
 * released — so the whole cascade is complete when this returns.
 *
 * When the schedule ends before the list does, the remaining effects are
 * skipped.
 *
 * @param effects - The animations to release in order.
 * @param schedule - When to release each subsequent one.
 * @returns `{ released }` — how many actually started.
 *
 * @example
 * A row of bars rising in a ripple, each starting 80ms after the last while
 * the earlier ones keep going.
 * ```typescript
 * yield* Scene.stagger(
 * 	bars.map((bar) => bar.pipe(Motion.moveTo({ y: 40 }, "600 millis"))),
 * 	Schedule.spaced("80 millis"),
 * );
 * ```
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
