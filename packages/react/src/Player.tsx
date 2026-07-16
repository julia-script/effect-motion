"use client";

import type { ThorvgWasm } from "@effect-motion/thorvg";
import * as ThorvgWasmBrowser from "@effect-motion/thorvg/ThorvgWasmBrowser";
import { Context, Data, Effect, ManagedRuntime, Schedule } from "effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import * as CanvasExporter from "effect-motion/CanvasExporter";
import * as Renderer from "effect-motion/Renderer";
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

const thorLayer = ThorvgWasmBrowser.layer(
	"https://unpkg.com/@thorvg/webcanvas@1.0.8/dist/thorvg.wasm",
);

class PlayerError extends Data.TaggedError("PlayerError")<{
	message: string;
	cause: unknown;
}> {
	static of(message: string) {
		return (cause: unknown) => new PlayerError({ message, cause });
	}
}

/**
 * Softened device-pixel-ratio, thorvg.web's formula: interpolate 75% of the
 * way from 1 to the native dpr — visually indistinguishable from full dpr at
 * a fraction of the rasterized pixels. Read per render call so moving the
 * window across monitors picks up the new ratio.
 */
const calculateDpr = () =>
	typeof window === "undefined"
		? 1
		: 1 + (window.devicePixelRatio - 1) * 0.75;
// const layer = Layer.con
// const runtime = ManagedRuntime.make()
const PlayerScene = Context.Service<{
	// runningScene: Scene.RunningScene<never, Runner.Runner | Scope.Scope>;
	// step: Effect.Effect<void, ThorvgException | EffectMotionError, ThorvgWasm>;
	render: (
		frameIndex: number,
	) => Effect.Effect<void, PlayerError, ThorvgWasm | Scope.Scope>;
	load: (
		frameIndex: number,
	) => Effect.Effect<void, PlayerError, ThorvgWasm | Scope.Scope>;
	play: Effect.Effect<void, PlayerError, ThorvgWasm | Scope.Scope>;
	pause: Effect.Effect<void, never, never>;

	readonly frameIndex: Effect.Effect<number>;
}>("PlayerScene");

/**
 * Frame-data buffer keyed by absolute frame index, retaining at most
 * `capacity` of the most-recently-pulled frames. Frames are pulled from the
 * scene monotonically forward (never re-derivable at a random index — the
 * scene is a forward-only stream), so the ring drops the oldest frames once
 * the window is full. A finite scene that fits within `capacity` behaves like
 * a plain array (nothing is ever evicted). Seeking below the retained window
 * clamps to `oldest` — the earliest frame still in memory.
 */
class FrameRing {
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
	/** oldest absolute index still retained */
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
	/** append the next frame at the edge, evicting the oldest if full */
	push(frame: Scene.Frame): void {
		if (Number.isFinite(this.capacity)) {
			this.slots[this.pulled % this.capacity] = frame;
		} else {
			this.slots[this.pulled] = frame;
		}
		this.pulled++;
	}
}

const useScene = (
	scene: Scene.Scene<never, Runner.Runner | Scope.Scope>,
	options: {
		fps: number;
		prebufferedFrames: number;
		autoPlay: boolean;
		isInfinite: boolean;
		loop: boolean;
		/** max frames retained in memory; Infinity keeps everything */
		bufferCapacity: number;
	},
) => {
	// loop is read live from optsRef inside the play loop, not destructured here
	const { fps, prebufferedFrames, autoPlay, isInfinite } = options;
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [currentFrame, setCurrentFrame] = useState(0);
	const [bufferedFrames, setBufferedFrames] = useState(0);
	// null until the scene stream ends (never, for infinite scenes)
	const [totalFrames, setTotalFrames] = useState<number | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	// repeat mode is player state seeded from the prop (an initial value); the
	// user toggles it live via the repeat button
	const [loop, setLoop] = useState(options.loop);

	// latest option values (incl. live loop), read inside the long-lived Effect
	// service without re-creating the runtime (which would re-run the scene)
	const optsRef = useRef({ ...options, loop });
	optsRef.current = { ...options, loop };

	const [runtime] = useState(() =>
		ManagedRuntime.make(
			Layer.effectContext(
				Effect.gen(function* () {
					const runningScene = yield* Scene.run(scene, {
						frameRate: fps,
					});
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

					const render: (
						frameIndex: number,
					) => Effect.Effect<void, PlayerError, ThorvgWasm | Scope.Scope> = (
						frameIndex,
					) =>
						Effect.gen(function* () {
							if (!canvasRef.current) {
								return;
							}

							// const frameToRender = frameIndex ?? currentFrame + 1;
							const framebuffer = yield* loadFrameBuffer(frameIndex);
							if (!framebuffer) {
								return;
							}
							// use the resolved index, not the requested one: a seek/advance
							// past the buffered edge resolves to the edge (clamped in
							// loadFrameBuffer), and the playhead must reflect what's shown
							updateCurrentFrame(framebuffer.index);

							const renderBuffer = yield* Renderer.render(framebuffer.frame, {
								dpr: calculateDpr(),
							});
							yield* CanvasExporter.toCanvas(renderBuffer, canvasRef.current);
						}).pipe(Effect.mapError(PlayerError.of("Error exporting canvas")));

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
			).pipe(Layer.provideMerge(thorLayer)),
		),
	);

	const render = useEffectEvent((frameIndex: number) =>
		Effect.service(PlayerScene).pipe(
			Effect.flatMap((e) => e.render(frameIndex)),
			Effect.scoped,
			runtime.runPromise,
		),
	);

	const load = useEffectEvent((frameIndex: number) =>
		Effect.service(PlayerScene).pipe(
			Effect.flatMap((e) => e.load(frameIndex)),
			Effect.scoped,
			runtime.runPromise,
		),
	);

	const play = useEffectEvent(() =>
		Effect.service(PlayerScene).pipe(
			Effect.flatMap((e) => e.play),
			Effect.scoped,
			runtime.runPromise,
		),
	);

	const pause = useEffectEvent(() =>
		Effect.service(PlayerScene).pipe(
			Effect.flatMap((e) => e.pause),
			Effect.scoped,
			runtime.runPromise,
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
		ref: canvasRef,
		currentFrame,
		bufferedFrames,
		totalFrames,
		currentTime,
		totalTime,
		play,
		pause,
		seek: render,
		isPlaying,
		loop,
		setLoop,
		load,
	};
};

export type PlayerProps = {
	// number of frames to prebuffer ahead of the current frame
	// also the number of frames buffered before playing
	// some edge cases:
	// 1. We need to prebuffer all frames
	//    to be able to display the total time
	//    and to update the progress bar
	//    so the default behavior is to prebuffer all frames (Infinity)
	// 2. if the animation is infinite, though,
	//    we cant ever try to prebuffer all frames,
	// 		because it would never end
	//    so the default behavior is to prebuffer 60 frames
	// 3. if the animation is finite, but user decides to not prebuffer it entirely,
	//    the progress bar should consider the frames that are actually buffered,
	//    but the time should not display the total frames number

	prebufferedFrames?: number;
	autoPlay?: boolean;
	fps?: number;

	// if true, it means that animation itself never ends, so we need to be sure we dont save all frames in memory
	// in this case we dont even show the progress bar, the user can only play and pause
	isInfinite?: boolean;

	// initial repeat mode for a finite animation: when on, it restarts from the
	// beginning after reaching the end. The player owns repeat state after mount
	// (a toggle button), so this is an initial value, not a controlled prop.
	// noop if the animation is infinite.
	defaultRepeatMode?: boolean;

	// max frames retained in memory (frame data, not pixels). Default keeps
	// everything for a finite scene; an infinite scene is windowed so it can't
	// grow forever. Seeking before the retained window clamps to its start.
	bufferCapacity?: number;

	scene: Scene.Scene<never, Runner.Runner | Scope.Scope>;
};

// keep-everything cap for an infinite scene: enough for ~30s of backward seek
// at 60fps, ~1MB of frame data. Bump via bufferCapacity for deeper scrubbing.
const INFINITE_BUFFER_CAP = 1800;

export const Player = ({
	scene,
	fps = 60,
	// default: prebuffer everything (Infinity) so the total time / progress bar
	// are known up front; an infinite scene falls back to a finite window below.
	prebufferedFrames = Number.POSITIVE_INFINITY,
	autoPlay = false,
	isInfinite = false,
	// initial repeat mode; the player owns it after mount (toggle button)
	defaultRepeatMode = false,
	bufferCapacity,
}: PlayerProps) => {
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
	} = useScene(scene, {
		fps,
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
// chrome: Vimeo-style player skin. Self-contained by design — inline style
// objects and inline SVG icons only, no stylesheet/tailwind/image deps.
// ---------------------------------------------------------------------------

const ACCENT = "#00adef"; // Vimeo blue

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
