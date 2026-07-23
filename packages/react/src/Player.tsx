"use client";

import * as FrameRenderer from "@effect-motion/renderer/Renderer";
import {
	Cause,
	Context,
	Data,
	Effect,
	ManagedRuntime,
	Schedule,
	Semaphore,
} from "effect";
import * as Layer from "effect/Layer";
import type * as Runner from "effect-motion/Runner";
import * as Scene from "effect-motion/Scene";
import * as Time from "effect-motion/Time";
import {
	type CSSProperties,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";

/**
 * Anything that went wrong inside the player: acquiring the renderer, a
 * resource load, pulling a frame, or rendering one.
 *
 * @remarks
 * Internal. The first failure is captured and shown in the player's error
 * panel; `message` says which stage failed and `cause` carries the original.
 */
class PlayerError extends Data.TaggedError("PlayerError")<{
	message: string;
	cause: unknown;
}> {
	static of(message: string) {
		return (cause: unknown) => new PlayerError({ message, cause });
	}
}

/**
 * The device pixel ratio to render at — 75% of the way from 1 to the
 * display's native ratio.
 *
 * @remarks
 * Rendering at full native ratio on a high-DPI display costs several times
 * the pixels for a difference nobody sees in motion. Softening it keeps text
 * and edges sharp at a fraction of the fill cost.
 *
 * Read on every render, so dragging a window between monitors picks up the
 * new ratio.
 */
const calculateDpr = () =>
	typeof window === "undefined" ? 1 : 1 + (window.devicePixelRatio - 1) * 0.75;

const PlayerScene = Context.Service<{
	render: (frameIndex: number) => Effect.Effect<void, PlayerError>;
	load: (frameIndex: number) => Effect.Effect<void, PlayerError>;
	play: Effect.Effect<void, PlayerError>;
	pause: Effect.Effect<void, never, never>;

	readonly frameIndex: Effect.Effect<number>;
}>("PlayerScene");

/**
 * The frame buffer: keeps the most recent `capacity` frames, keyed by
 * absolute frame index.
 *
 * @remarks
 * A scene is a forward-only stream — frame 400 can only be reached by
 * pulling frames 0 through 399 — so a frame that has been evicted cannot be
 * recomputed on demand. That is why seeking below the retained window clamps
 * to {@link FrameRing.oldest} rather than replaying.
 *
 * With an infinite `capacity` nothing is ever evicted and this behaves like
 * a plain array, which is the finite-scene default.
 */
class FrameRing {
	/** slots indexed by `absoluteIndex % capacity`, or densely when unbounded */
	// ponytail: fixed-capacity ring keyed by absolute index. capacity=Infinity
	// keeps everything (finite scenes that fit); a finite cap bounds memory for
	// long/infinite scenes at the cost of losing far-back seek. Bump the cap if
	// deep backward seeking on huge scenes ever matters.
	private readonly slots: Array<Scene.Frame | undefined>;
	/** total frames pulled from the scene so far (monotonic) */
	pulled = 0;
	constructor(private readonly capacity: number) {
		this.slots = Number.isFinite(capacity) ? new Array(capacity) : [];
	}
	/** The earliest frame index still in memory — the floor for any seek. */
	get oldest(): number {
		return Number.isFinite(this.capacity)
			? Math.max(0, this.pulled - this.capacity)
			: 0;
	}
	has(index: number): boolean {
		return index >= this.oldest && index < this.pulled;
	}
	get(index: number): Scene.Frame | undefined {
		if (!this.has(index)) {
			return undefined;
		}
		return Number.isFinite(this.capacity)
			? this.slots[index % this.capacity]
			: this.slots[index];
	}
	/** Append the next frame, evicting the oldest once the window is full. */
	push(frame: Scene.Frame): void {
		if (Number.isFinite(this.capacity)) {
			this.slots[this.pulled % this.capacity] = frame;
		} else {
			this.slots[this.pulled] = frame;
		}
		this.pulled++;
	}
}

/**
 * The player's engine: runs the scene, buffers frames, drives the playback
 * clock, and renders to a canvas.
 *
 * @remarks
 * Internal — {@link Player} is the public surface. Returns the canvas ref,
 * playback state, and the controls the chrome is wired to.
 *
 * Two things worth knowing when reading this. All the Effect work runs in
 * ONE `ManagedRuntime` created per mount and disposed on unmount, which is
 * what releases the GPU renderer and interrupts in-flight fibers. And the
 * playback clock is wall-clock on purpose: it drives real-time playback
 * speed, not scene time, so the determinism rule banning clocks inside
 * scenes does not apply to it.
 */
const useScene = (
	sceneProp: Scene.AnyScene,
	options: {
		fps: number;
		prebufferedFrames: number;
		autoPlay: boolean;
		isInfinite: boolean;
		loop: boolean;
		/** Max frames retained; `Infinity` keeps everything. */
		bufferCapacity: number;
		/** Extra `Scene.run` settings; `frameRate` comes from `fps`. */
		settings?: Partial<Runner.Settings> | undefined;
		/**
		 * Loader layers for the scene's resources.
		 *
		 * @remarks
		 * Coverage is enforced at the props boundary ({@link PlayerProps}); by
		 * the time it reaches here it is known complete. Merged into the
		 * per-mount runtime, so every provided load runs when the runtime is
		 * built.
		 */
		renderLayers?: Layer.Layer<never, unknown, never> | undefined;
	},
) => {
	// internal seam mirroring makeScene's: the props boundary guarantees
	// renderLayers covers Scene.Resources<S>, so frames render as loader-free
	const scene = sceneProp as Scene.Scene<never, Runner.Runner>;
	// loop is read live from optsRef inside the play loop, not destructured here
	const { fps, prebufferedFrames, autoPlay, isInfinite, settings } = options;
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [currentFrame, setCurrentFrame] = useState(0);
	const [bufferedFrames, setBufferedFrames] = useState(0);
	// null until the scene stream ends (never, for infinite scenes)
	const [totalFrames, setTotalFrames] = useState<number | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	// repeat mode is player state seeded from the prop (an initial value); the
	// user toggles it live via the repeat button
	const [loop, setLoop] = useState(options.loop);
	// first real failure (engine acquisition, loader load at runtime build,
	// render) — rendered visibly by the Player, never only logged
	const [error, setError] = useState<unknown>(null);

	// latest option values (incl. live loop), read inside the long-lived Effect
	// service without re-creating the runtime (which would re-run the scene)
	const optsRef = useRef({ ...options, loop });
	optsRef.current = { ...options, loop };

	// One runtime per mount, DISPOSED on unmount: disposal closes the layer
	// scope, which disposes the per-player three renderer (GPU resources,
	// retained objects) — nothing is shared across players. Held in a ref,
	// not state, so a strict-mode remount can recreate it after the first
	// cleanup disposed it.
	const makeRuntime = () =>
		ManagedRuntime.make(
			Layer.effectContext(
				Effect.gen(function* () {
					const runningScene = yield* Scene.run(scene, {
						...settings,
						frameRate: fps,
					});
					// the per-player renderer, bound to this mount's canvas and
					// released with the runtime; init (incl. WebGPU device) happens
					// here, so an acquisition failure surfaces as the error state
					const canvas = canvasRef.current;
					if (canvas === null) {
						return yield* Effect.fail(
							PlayerError.of("Player canvas is not mounted")(null),
						);
					}
					const sink = yield* FrameRenderer.make({
						canvas,
						width: 1,
						height: 1,
					}).pipe(
						Effect.mapError(PlayerError.of("Error acquiring the renderer")),
					);
					// viewport tracking: sized from frame metadata on first render
					let sized = { width: 0, height: 0, dpr: 0 };
					// pipeline pre-warm happens once, on the first rendered frame,
					// before playback reveals motion — no first-frame compile jank
					let prewarmed = false;
					let currentFrame = 0;
					let isPlaying = false;
					// total frame count once the stream ends; null while unknown
					let totalFramesValue: number | null = null;
					const setTotal = (n: number) => {
						totalFramesValue = n;
						setTotalFrames(n);
					};

					const updateCurrentFrame = (frameIndex: number) => {
						currentFrame = frameIndex;
						setCurrentFrame(frameIndex);
					};

					const updateIsPlaying = (newIsPlaying: boolean) => {
						isPlaying = newIsPlaying;
						setIsPlaying(isPlaying);
					};
					const ring = new FrameRing(options.bufferCapacity);
					const loadFrameBuffer = (requested = ring.pulled) =>
						Effect.gen(function* () {
							// clamp a seek that fell off the back of the ring to the
							// oldest retained frame (can't replay a forward-only stream)
							const index = Math.max(requested, ring.oldest);

							const existing = ring.get(index);
							if (existing) {
								return { frame: existing, index };
							}

							if (runningScene.done && index >= ring.pulled) {
								// finite scene fully buffered — publish the total once
								setTotal(ring.pulled);
								return null;
							}

							// pull forward until the requested index is at the edge
							while (true) {
								const frame = yield* Scene.step(runningScene);
								if (!frame) {
									// stream ended: this is the total frame count
									setTotal(ring.pulled);
									break;
								}

								ring.push(frame);
								setBufferedFrames(ring.pulled);
								if (index <= ring.pulled - 1) {
									break;
								}
							}
							const edge = Math.min(index, ring.pulled - 1);
							return {
								frame: ring.get(edge) as Scene.Frame,
								index: edge,
							};
						}).pipe(
							Effect.mapError(PlayerError.of("Error getting frame buffer")),
						);

					const renderSemaphore = yield* Semaphore.make(1);

					const render: (
						frameIndex: number,
					) => Effect.Effect<void, PlayerError> = (frameIndex) =>
						renderSemaphore.withPermitsIfAvailable(1)(
							Effect.gen(function* () {
								if (!canvasRef.current) {
									return;
								}

								const framebuffer = yield* loadFrameBuffer(frameIndex);
								if (!framebuffer) {
									return;
								}
								// use the resolved index, not the requested one: a seek/advance
								// past the buffered edge resolves to the edge (clamped in
								// loadFrameBuffer), and the playhead must reflect what's shown
								updateCurrentFrame(framebuffer.index);

								const frame = framebuffer.frame;
								const dpr = calculateDpr();
								if (
									sized.width !== frame.width ||
									sized.height !== frame.height ||
									sized.dpr !== dpr
								) {
									sized = { width: frame.width, height: frame.height, dpr };
									FrameRenderer.setViewport(
										sink,
										frame.width,
										frame.height,
										dpr,
									);
								}
								// font loaders resolve from this runtime's context (the
								// renderLayers merge); missing loaders defect loudly
								yield* FrameRenderer.resolveResources(sink, frame);
								yield* FrameRenderer.syncFrame(sink, frame);
								if (!prewarmed) {
									prewarmed = true;
									yield* FrameRenderer.prewarm(sink);
								}
								yield* FrameRenderer.render(sink);
							}).pipe(Effect.mapError(PlayerError.of("Error rendering frame"))),
						);

					const play = Effect.suspend(() => {
						if (isPlaying) return Effect.void;

						// replaying from the end of a finished finite scene: rewind
						const total = totalFramesValue;
						if (total !== null && currentFrame >= total - 1) {
							updateCurrentFrame(0);
						}

						isPlaying = true;
						updateIsPlaying(true);

						// Real-time playback clock. Each tick advances by however many
						// whole frames of wall-clock have elapsed since the last tick
						// (accumulator), so playback keeps real time even when a render
						// is slow — intermediate frames are dropped, only the latest is
						// rendered. The driver ticks a bit faster than the frame period
						// so we never systematically miss a frame boundary; the
						// accumulator decides whether a frame is actually due.
						const frameMs = 1000 / fps;
						let lastTick: number | null = null;
						let acc = 0;
						const tick = Effect.gen(function* () {
							// wall-clock is intentional here: it drives real playback
							// speed — not scene time, so the determinism rule that bans
							// wall-clock in scenes doesn't apply.
							const now = performance.now();
							if (lastTick === null) {
								lastTick = now;
								return;
							}
							const elapsed = now - lastTick;
							lastTick = now;
							acc += elapsed;
							const advance = Math.floor(acc / frameMs);
							if (advance <= 0) {
								return;
							}
							acc -= advance * frameMs;

							let next = currentFrame + advance;
							const total = totalFramesValue;
							if (total !== null && next > total - 1) {
								// past the end of a finite scene: wrap when looping,
								// else clamp to the last frame (a big `advance` from a
								// slow tick must not overshoot into the unbuffered void,
								// which would render nothing and wedge the playhead)
								next =
									optsRef.current.loop && !optsRef.current.isInfinite
										? next % total
										: total - 1;
							}
							yield* render(next);
						});
						// small fixed spacing (quarter-frame) so the accumulator sees
						// each frame boundary; the tick itself no-ops until a frame is due
						const loop = Effect.repeat({
							schedule: Schedule.spaced(Math.max(1, frameMs / 4)),
							// keep playing until we reach the last buffered frame of a
							// finished scene — unless looping (then wrap forever). A scene
							// that is `done` but not yet at its last frame must keep going.
							while: () => {
								if (!isPlaying) return false;
								const total = totalFramesValue;
								if (total === null) return true; // still buffering
								if (optsRef.current.loop && !optsRef.current.isInfinite) {
									return true;
								}
								return currentFrame < total - 1;
							},
						});
						return loop(tick).pipe(
							Effect.ensuring(Effect.sync(() => updateIsPlaying(false))),
						);
					});
					const pause = Effect.sync(() => {
						isPlaying = false;
						updateIsPlaying(false);
					});
					return Context.make(PlayerScene, {
						play,
						pause,
						frameIndex: Effect.sync(() => currentFrame),
						render,
						load: (frameIndex?: number) => loadFrameBuffer(frameIndex),
					});
				}),
			).pipe(
				// caller-provided loader layers: every provided load runs here, at
				// runtime construction (eager, preload-all-provided) — a failed
				// load fails the runtime build and surfaces as the error state
				Layer.provideMerge(options.renderLayers ?? Layer.empty),
			),
		);
	const runtimeRef = useRef<ReturnType<typeof makeRuntime> | null>(null);
	const getRuntime = () => {
		if (runtimeRef.current === null) {
			runtimeRef.current = makeRuntime();
		}
		return runtimeRef.current;
	};
	useEffect(
		() => () => {
			// dispose interrupts our own in-flight fibers (play loop, prebuffer);
			// its promise then rejects with that interruption — expected teardown,
			// never actionable from a cleanup callback
			runtimeRef.current?.dispose().catch(() => undefined);
			runtimeRef.current = null;
		},
		[],
	);

	// Disposing the runtime on unmount INTERRUPTS in-flight fibers (the play
	// loop, prebuffering). These handlers are fire-and-forget, so a rejecting
	// runPromise would surface as an unhandled rejection on every navigation
	// away from a playing scene. runPromiseExit never rejects — failures come
	// back as Exit values. Two teardown shapes are silenced: interruption-only
	// causes (dispose cancelling our own fibers — under strict mode this
	// happens on EVERY mount, whose first-generation runtime is disposed with
	// render/prebuffer still in flight), and failures from a runtime that is
	// no longer current (a stale generation's teardown noise). Everything else
	// is a real player error and is reported.
	const runReported = (
		effect: Parameters<ReturnType<typeof makeRuntime>["runPromiseExit"]>[0],
	): Promise<void> => {
		const runtime = getRuntime();
		return runtime.runPromiseExit(effect).then((exit) => {
			if (exit._tag !== "Failure") {
				return;
			}
			if (Cause.hasInterruptsOnly(exit.cause)) {
				return;
			}
			if (runtimeRef.current !== runtime) {
				return;
			}
			console.error("effect-motion player:", String(exit.cause), exit.cause);
			// surface the first failure visibly (loader/engine failures at
			// runtime construction land here too — the runtime build is lazy,
			// forced by the first render/load call)
			setError((current: unknown) => current ?? exit.cause);
		});
	};

	const render = useEffectEvent((frameIndex: number) =>
		runReported(
			Effect.service(PlayerScene).pipe(
				Effect.flatMap((e) => e.render(frameIndex)),
				Effect.scoped,
			),
		),
	);

	const load = useEffectEvent((frameIndex: number) =>
		runReported(
			Effect.service(PlayerScene).pipe(
				Effect.flatMap((e) => e.load(frameIndex)),
				Effect.scoped,
			),
		),
	);

	const play = useEffectEvent(() =>
		runReported(
			Effect.service(PlayerScene).pipe(
				Effect.flatMap((e) => e.play),
				Effect.scoped,
			),
		),
	);

	const pause = useEffectEvent(() =>
		runReported(
			Effect.service(PlayerScene).pipe(
				Effect.flatMap((e) => e.pause),
				Effect.scoped,
			),
		),
	);

	// prebuffer + autoplay once the runtime exists. For an infinite scene we
	// can't buffer to the end, so cap at the requested prebuffer count.
	// biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount; render/load/play are stable useEffectEvents and the options only matter at startup
	useEffect(() => {
		render(0);
		load(isInfinite ? prebufferedFrames : Math.max(prebufferedFrames, 0));
		if (autoPlay) {
			play();
		}
	}, []);

	// scene time in seconds of the current frame, and total when known
	const currentTime = Time.frameToMillis(currentFrame, fps) / 1000;
	const totalTime =
		totalFrames !== null
			? Time.frameToMillis(totalFrames - 1, fps) / 1000
			: null;

	return {
		/** Attach to the canvas the player draws into. */
		ref: canvasRef,
		/** The frame currently shown. */
		currentFrame,
		/** How many frames have been pulled from the scene so far. */
		bufferedFrames,
		/** Total frames, or `null` until the scene has been pulled to its end. */
		totalFrames,
		/** Scene time of the current frame, in seconds. */
		currentTime,
		/** Total duration in seconds, or `null` while unknown. */
		totalTime,
		play,
		pause,
		/** Jump to a frame; clamps to the buffered window. */
		seek: render,
		isPlaying,
		/** Whether repeat is on (player-owned after mount). */
		loop,
		setLoop,
		/** Buffer ahead to a frame without displaying it. */
		load,
		/** The first failure, or `null`. Rendered as the error panel. */
		error,
	};
};

/**
 * Props for {@link Player}.
 *
 * @typeParam S - The scene's type, which decides whether `renderLayers` is
 *   required.
 *
 * @remarks
 * Only `scene` is required — and `renderLayers`, if the scene declares
 * resources. Everything else has a working default.
 */
export type PlayerProps<S extends Scene.AnyScene = Scene.AnyScene> = {
	/**
	 * How many frames to buffer ahead before playing.
	 *
	 * @remarks
	 * The default buffers the WHOLE scene, which is what makes the total
	 * duration and a complete progress bar available immediately. Lower it to
	 * start playing sooner on a long scene: the progress bar then tracks how
	 * much is buffered so far, and the total time stays hidden until the
	 * scene has been pulled to its end.
	 *
	 * An infinite scene can never be fully buffered, so it falls back to 60
	 * frames.
	 *
	 * @defaultValue `Infinity` (60 when `isInfinite`)
	 */
	prebufferedFrames?: number;
	/**
	 * Start playing on mount instead of waiting for the play button.
	 *
	 * @defaultValue `false`
	 */
	autoPlay?: boolean;
	/**
	 * Frames per second, for both the scene and the playback clock.
	 *
	 * @remarks
	 * Overridden by `settings.frameRate` when both are given, so the two can
	 * never disagree.
	 *
	 * @defaultValue `60`
	 */
	fps?: number;

	/**
	 * Declare that the scene never ends.
	 *
	 * @remarks
	 * Set this for a scene built to run forever — an ambient loop, a
	 * `Schedule.forever` background. It changes three things: frames are
	 * buffered in a bounded window rather than kept forever, only a prefix is
	 * prebuffered, and the scrubber and repeat toggle are hidden, since
	 * neither means anything without an end. Play and pause remain.
	 *
	 * @defaultValue `false`
	 */
	isInfinite?: boolean;

	/**
	 * Whether repeat starts switched on.
	 *
	 * @remarks
	 * An INITIAL value, not a controlled prop — the player owns repeat state
	 * once mounted, because the user can toggle it with the repeat button.
	 * Ignored for an infinite scene.
	 *
	 * @defaultValue `false`
	 */
	defaultRepeatMode?: boolean;

	/**
	 * How many frames of scene DATA to keep in memory.
	 *
	 * @remarks
	 * Frame data, not rendered pixels. A finite scene keeps everything so
	 * seeking anywhere works; an infinite scene keeps a window, since
	 * retaining every frame of an endless scene would grow without bound.
	 *
	 * Seeking before the retained window clamps to its oldest frame — a scene
	 * is a forward-only stream, so frames that fell out cannot be recomputed.
	 * Raise this if deep backward scrubbing on a long scene matters.
	 *
	 * @defaultValue `Infinity` for a finite scene; `1800` (~30s at 60fps) when
	 *   `isInfinite`
	 */
	bufferCapacity?: number;

	/**
	 * Playback settings passed to the scene run — `seed`, `maxFrames`, and
	 * `frameRate`.
	 *
	 * @remarks
	 * Resolution and background are NOT here: those belong to the scene's own
	 * composition config, fixed when it was made. A `frameRate` given here
	 * wins over the `fps` prop.
	 */
	settings?: Partial<Runner.Settings>;

	/** The scene to play. */
	scene: S;
} & (Scene.Resources<S> extends never
	? {
			/**
			 * Not accepted: this scene declares no resources, so passing
			 * loaders is a compile error.
			 */
			renderLayers?: never;
		}
	: {
			/**
			 * Loaders for the fonts and images the scene uses.
			 *
			 * @remarks
			 * REQUIRED when the scene declares resources, and it must cover
			 * every one of them — the types will not let you mount a player
			 * that is missing a loader, so a missing font is a compile error
			 * rather than blank text at runtime. Combine several with
			 * `Layer.mergeAll(...)`.
			 *
			 * Loads run once, eagerly, when the player mounts. A failed load
			 * shows in the player's error panel.
			 */
			renderLayers: Layer.Layer<Scene.Resources<S>, unknown, never>;
		});

/**
 * Frames retained for an infinite scene — about 30 seconds of backward seek
 * at 60fps, roughly 1MB of frame data.
 *
 * @remarks
 * An endless scene cannot keep every frame, so this bounds the window.
 * Callers who need deeper scrubbing raise it with `bufferCapacity`.
 */
const INFINITE_BUFFER_CAP = 1800;

/**
 * A video-style player for an effect-motion scene.
 *
 * @remarks
 * Self-contained: a canvas plus play/pause, a scrubber with buffered-range
 * indicator, a time readout, and a repeat toggle. Controls fade out during
 * playback and return on hover. There is no stylesheet to import — the skin
 * is inline styles and inline SVG — and no way to restyle it short of
 * wrapping it.
 *
 * The canvas is `width: 100%` with automatic height, so the player fills its
 * container at the scene's aspect ratio. Size it by sizing the parent.
 *
 * Frames stream in rather than being pre-rendered, so playback starts before
 * the whole scene is computed. Playback keeps real time: if a frame renders
 * slowly the player drops intermediate frames rather than falling behind.
 *
 * Each player owns its own GPU renderer and scene run, released on unmount.
 *
 * Failures — no WebGPU, a font that would not load, a render error — are
 * shown in the player's own frame as an alert panel, not just logged to the
 * console.
 *
 * @example
 * ```tsx
 * <Player scene={scene} autoPlay />
 * ```
 *
 * @example
 * An endless scene: bounded memory, and no scrubber or repeat button.
 * ```tsx
 * <Player scene={ambientScene} isInfinite autoPlay />
 * ```
 */
export const Player = <S extends Scene.AnyScene>({
	scene,
	fps: fpsProp = 60,
	// default: prebuffer everything (Infinity) so the total time / progress bar
	// are known up front; an infinite scene falls back to a finite window below.
	prebufferedFrames = Number.POSITIVE_INFINITY,
	autoPlay = false,
	isInfinite = false,
	// initial repeat mode; the player owns it after mount (toggle button)
	defaultRepeatMode = false,
	bufferCapacity,
	settings,
	renderLayers,
}: PlayerProps<S>) => {
	// one effective rate for both the scene run and the playback clock
	const fps = settings?.frameRate ?? fpsProp;
	const {
		ref,
		currentFrame,
		bufferedFrames,
		totalFrames,
		currentTime,
		totalTime,
		play,
		pause,
		seek,
		isPlaying,
		loop,
		setLoop,
		error,
	} = useScene(scene, {
		fps,
		settings,
		renderLayers: renderLayers as
			| Layer.Layer<never, unknown, never>
			| undefined,
		// an infinite scene can never buffer to the end — window it (60 frames
		// if the caller left prebufferedFrames unbounded)
		prebufferedFrames:
			isInfinite && !Number.isFinite(prebufferedFrames)
				? 60
				: prebufferedFrames,
		autoPlay,
		isInfinite,
		loop: defaultRepeatMode,
		// finite scenes keep everything (so far-back seek works); infinite
		// scenes are windowed so memory can't grow forever
		bufferCapacity:
			bufferCapacity ??
			(isInfinite ? INFINITE_BUFFER_CAP : Number.POSITIVE_INFINITY),
	});

	// progress denominator: the total when known, else the buffered edge
	const denominator = (totalFrames ?? bufferedFrames) - 1;

	// ---- chrome state (hover/scrub only — playback state lives in useScene) ----
	const [hovering, setHovering] = useState(false);
	const [scrubbing, setScrubbing] = useState(false);
	const [barHover, setBarHover] = useState(false);
	const [bigPlayHover, setBigPlayHover] = useState(false);
	// frame under the cursor while hovering the scrubber (for the time chip)
	const [hoverFrame, setHoverFrame] = useState(0);
	const barRef = useRef<HTMLDivElement>(null);

	const controlsVisible = hovering || scrubbing || !isPlaying;

	const frameAtPointer = (clientX: number) => {
		const bar = barRef.current;
		if (!bar || denominator <= 0) {
			return 0;
		}
		const rect = bar.getBoundingClientRect();
		const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		return Math.round(frac * denominator);
	};

	const playedFrac = denominator > 0 ? currentFrame / denominator : 0;
	const bufferedFrac =
		denominator > 0 ? Math.min(1, (bufferedFrames - 1) / denominator) : 0;
	// the chip tracks the cursor while hovering, the playhead while dragging
	const chipFrame = scrubbing ? currentFrame : hoverFrame;
	const chipFrac = denominator > 0 ? chipFrame / denominator : 0;
	const barActive = barHover || scrubbing;

	// a failed engine acquisition, loader load, or render: show the failure
	// in the player's frame instead of a black box + console line
	if (error !== null) {
		return (
			<div style={S.player}>
				<div style={S.errorPanel} role="alert">
					<strong>effect-motion player failed</strong>
					<pre style={S.errorDetail}>{String(error)}</pre>
				</div>
			</div>
		);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: hover-only listeners toggle control visibility; the buttons/slider inside are the interactive surface
		<div
			style={S.player}
			onMouseEnter={() => setHovering(true)}
			onMouseLeave={() => setHovering(false)}
		>
			{/* click-to-toggle, like every video player */}
			<canvas
				ref={ref}
				style={S.canvas}
				onClick={() => (isPlaying ? pause() : play())}
			/>

			{!isPlaying && (
				<button
					type="button"
					aria-label="Play"
					style={{
						...S.bigPlay,
						background: bigPlayHover ? ACCENT : "rgba(0, 0, 0, 0.65)",
					}}
					onMouseEnter={() => setBigPlayHover(true)}
					onMouseLeave={() => setBigPlayHover(false)}
					onClick={() => play()}
				>
					<PlayIcon size={26} />
				</button>
			)}

			{/* legibility gradient behind the controls */}
			<div style={{ ...S.gradient, opacity: controlsVisible ? 1 : 0 }} />

			<div
				style={{
					...S.controls,
					opacity: controlsVisible ? 1 : 0,
					pointerEvents: controlsVisible ? "auto" : "none",
				}}
			>
				<button
					type="button"
					aria-label={isPlaying ? "Pause" : "Play"}
					style={S.iconButton}
					onClick={() => (isPlaying ? pause() : play())}
				>
					{isPlaying ? <PauseIcon /> : <PlayIcon />}
				</button>

				{/* scrubber — hidden for infinite scenes (no meaningful total) */}
				{!isInfinite && (
					<div
						ref={barRef}
						role="slider"
						aria-label="Seek"
						aria-valuemin={0}
						aria-valuemax={Math.max(0, denominator)}
						aria-valuenow={currentFrame}
						tabIndex={0}
						style={S.scrub}
						onPointerDown={(e) => {
							e.currentTarget.setPointerCapture(e.pointerId);
							setScrubbing(true);
							seek(frameAtPointer(e.clientX));
						}}
						onPointerMove={(e) => {
							setHoverFrame(frameAtPointer(e.clientX));
							if (scrubbing) {
								seek(frameAtPointer(e.clientX));
							}
						}}
						onPointerUp={() => setScrubbing(false)}
						onMouseEnter={() => setBarHover(true)}
						onMouseLeave={() => setBarHover(false)}
						onKeyDown={(e) => {
							// arrow keys step one second of frames
							if (e.key === "ArrowRight") {
								seek(Math.min(denominator, currentFrame + fps));
							} else if (e.key === "ArrowLeft") {
								seek(Math.max(0, currentFrame - fps));
							}
						}}
					>
						<div style={{ ...S.track, height: barActive ? 6 : 4 }}>
							<div
								style={{
									...S.trackFill,
									width: `${bufferedFrac * 100}%`,
									background: "rgba(255, 255, 255, 0.35)",
								}}
							/>
							<div
								style={{
									...S.trackFill,
									width: `${playedFrac * 100}%`,
									background: ACCENT,
								}}
							/>
						</div>
						{barActive && (
							<>
								<div style={{ ...S.thumb, left: `${playedFrac * 100}%` }} />
								<div style={{ ...S.chip, left: `${chipFrac * 100}%` }}>
									{formatTime(Time.frameToMillis(chipFrame, fps) / 1000)}
								</div>
							</>
						)}
					</div>
				)}

				<span style={S.time}>
					{formatTime(currentTime)}
					{totalTime !== null ? ` / ${formatTime(totalTime)}` : ""}
				</span>

				{/* repeat toggle — no meaning for an intrinsically infinite scene */}
				{!isInfinite && (
					<button
						type="button"
						aria-label="Repeat"
						aria-pressed={loop}
						title={loop ? "Repeat on" : "Repeat off"}
						style={{
							...S.iconButton,
							color: loop ? ACCENT : "rgba(255, 255, 255, 0.7)",
						}}
						onClick={() => setLoop((v) => !v)}
					>
						<RepeatIcon />
					</button>
				)}
			</div>
		</div>
	);
};

// ---------------------------------------------------------------------------
// chrome: the player skin. Self-contained by design — inline style objects
// and inline SVG icons only, so the package ships no stylesheet and pulls in
// no CSS framework or image assets. The tradeoff is that the look is fixed:
// restyling means wrapping the player, not overriding classes.
// ---------------------------------------------------------------------------

const ACCENT = "#00adef"; // Vimeo blue

/** Seconds as `m:ss`, for the time readout and the scrubber chip. */
const formatTime = (seconds: number) => {
	const s = Math.max(0, Math.floor(seconds));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const PlayIcon = ({ size = 18 }: { size?: number }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="currentColor"
		aria-hidden="true"
	>
		<path d="M7 4.5v15l13-7.5z" />
	</svg>
);

const PauseIcon = ({ size = 18 }: { size?: number }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="currentColor"
		aria-hidden="true"
	>
		<path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" />
	</svg>
);

// looping arrows (stroke icon — reads as "repeat" at small sizes)
const RepeatIcon = ({ size = 18 }: { size?: number }) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth={2}
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d="M17 2l4 4-4 4" />
		<path d="M3 11V9a4 4 0 0 1 4-4h14" />
		<path d="M7 22l-4-4 4-4" />
		<path d="M21 13v2a4 4 0 0 1-4 4H3" />
	</svg>
);

const S = {
	player: {
		position: "relative",
		width: "100%",
		background: "#000",
		borderRadius: 8,
		overflow: "hidden",
		lineHeight: 1,
		userSelect: "none",
		WebkitUserSelect: "none",
		fontFamily:
			"system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
	},
	errorPanel: {
		padding: "24px 20px",
		color: "#ffb4ab",
		background: "#1a1113",
		fontSize: 13,
		lineHeight: 1.5,
	},
	errorDetail: {
		margin: "8px 0 0",
		whiteSpace: "pre-wrap",
		wordBreak: "break-word",
		fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
		fontSize: 12,
		opacity: 0.85,
	},
	canvas: {
		display: "block",
		width: "100%",
		height: "auto",
		cursor: "pointer",
	},
	bigPlay: {
		position: "absolute",
		top: "50%",
		left: "50%",
		transform: "translate(-50%, -50%)",
		width: 66,
		height: 46,
		border: "none",
		borderRadius: 8,
		color: "#fff",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		cursor: "pointer",
		transition: "background 120ms ease",
	},
	gradient: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: 72,
		background: "linear-gradient(transparent, rgba(0, 0, 0, 0.6))",
		pointerEvents: "none",
		transition: "opacity 200ms ease",
	},
	controls: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		display: "flex",
		alignItems: "center",
		gap: 10,
		padding: "0 10px 8px 6px",
		transition: "opacity 200ms ease",
	},
	iconButton: {
		border: "none",
		background: "transparent",
		padding: 4,
		margin: 0,
		color: "#fff",
		display: "flex",
		alignItems: "center",
		cursor: "pointer",
	},
	scrub: {
		position: "relative",
		flex: 1,
		display: "flex",
		alignItems: "center",
		height: 16,
		cursor: "pointer",
		touchAction: "none",
	},
	track: {
		position: "relative",
		width: "100%",
		borderRadius: 2,
		background: "rgba(255, 255, 255, 0.2)",
		overflow: "hidden",
		transition: "height 100ms ease",
	},
	trackFill: {
		position: "absolute",
		left: 0,
		top: 0,
		bottom: 0,
		borderRadius: 2,
	},
	thumb: {
		position: "absolute",
		top: "50%",
		width: 12,
		height: 12,
		borderRadius: "50%",
		background: "#fff",
		transform: "translate(-50%, -50%)",
		boxShadow: "0 0 4px rgba(0, 0, 0, 0.4)",
		pointerEvents: "none",
	},
	chip: {
		position: "absolute",
		bottom: 20,
		transform: "translateX(-50%)",
		background: "rgba(0, 0, 0, 0.85)",
		color: "#fff",
		fontSize: 11,
		fontVariantNumeric: "tabular-nums",
		padding: "4px 6px",
		borderRadius: 4,
		whiteSpace: "nowrap",
		pointerEvents: "none",
	},
	time: {
		// pushes itself + the repeat button to the right of the scrubber
		marginLeft: "auto",
		color: "#fff",
		fontSize: 12,
		fontVariantNumeric: "tabular-nums",
	},
} satisfies Record<string, CSSProperties>;
