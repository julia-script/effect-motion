"use client";

import { Context, Data, Effect, ManagedRuntime, Schedule } from "effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import type * as Runner from "effect-motion/Runner";
import * as Scene from "effect-motion/Scene";
import * as Time from "effect-motion/Time";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import * as CanvasExporter from "effect-motion/CanvasExporter";
import * as Renderer from "effect-motion/Renderer";
import * as ThorvgWasmBrowser from "@effect-motion/thorvg/ThorvgWasmBrowser";
import { ThorvgWasm } from "@effect-motion/thorvg";

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

const useScene = <E,>(
	scene: Scene.Scene<E, Runner.Runner | Scope.Scope>,
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
	// measured playback fps (rolling), distinct from the scene's target fps
	const [measuredFps, setMeasuredFps] = useState(0);

	// latest option values, read inside the long-lived Effect service without
	// re-creating the runtime (which would re-run the scene)
	const optsRef = useRef(options);
	optsRef.current = options;

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

							const renderBuffer = yield* Renderer.render(framebuffer.frame);
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
							// speed and measures fps — not scene time, so the
							// determinism rule that bans wall-clock in scenes doesn't
							// apply.
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
							if (elapsed > 0) {
								setMeasuredFps(Math.round(1000 / elapsed));
							}

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
	useEffect(() => {
		render(0);
		load(isInfinite ? prebufferedFrames : Math.max(prebufferedFrames, 0));
		if (autoPlay) {
			play();
		}
		// run once on mount; render/load/play are stable useEffectEvents
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// scene time in seconds of the current frame, and total when known
	const currentTime = Time.frameToMillis(currentFrame, fps) / 1000;
	const totalTime =
		totalFrames !== null ? Time.frameToMillis(totalFrames - 1, fps) / 1000 : null;

	return {
		ref: canvasRef,
		currentFrame,
		bufferedFrames,
		totalFrames,
		currentTime,
		totalTime,
		measuredFps,
		play,
		pause,
		seek: render,
		isPlaying,
		load,
	};
};

type PlayerOptions = {
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

	// this is for a finite animation, that we want to play in loop, different than the case above where the animation itself is infinte
	// the animation restarts from the beginning when it ends
	// noop if the animation is infinite
	loop?: boolean;

	// max frames retained in memory (frame data, not pixels). Default keeps
	// everything for a finite scene; an infinite scene is windowed so it can't
	// grow forever. Seeking before the retained window clamps to its start.
	bufferCapacity?: number;

	scene: Scene.Scene<never, Runner.Runner | Scope.Scope>;


};

// keep-everything cap for an infinite scene: enough for ~30s of backward seek
// at 60fps, ~1MB of frame data. Bump via bufferCapacity for deeper scrubbing.
const INFINITE_BUFFER_CAP = 1800;

export const NewPlayer = ({
	scene,
	fps = 60,
	// default: prebuffer everything (Infinity) so the total time / progress bar
	// are known up front; an infinite scene falls back to a finite window below.
	prebufferedFrames = Number.POSITIVE_INFINITY,
	autoPlay = false,
	isInfinite = false,
	loop = false,
	bufferCapacity,
}: PlayerOptions) => {
	const {
		ref,
		currentFrame,
		bufferedFrames,
		totalFrames,
		currentTime,
		totalTime,
		measuredFps,
		play,
		pause,
		seek,
		isPlaying,
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
		loop,
		// finite scenes keep everything (so far-back seek works); infinite
		// scenes are windowed so memory can't grow forever
		bufferCapacity:
			bufferCapacity ??
			(isInfinite ? INFINITE_BUFFER_CAP : Number.POSITIVE_INFINITY),
	});

	// progress denominator: the total when known, else the buffered edge
	const denominator = (totalFrames ?? bufferedFrames) - 1;

	return (
		<div className="flex flex-col gap-2">
			<canvas ref={ref} />

			{/* progress bar — hidden for infinite scenes (no meaningful total) */}
			{!isInfinite && (
				<input
					type="range"
					min={0}
					max={Math.max(0, denominator)}
					value={currentFrame}
					onChange={(e) => seek(Number(e.target.value))}
					className="w-full"
					aria-label="Seek"
				/>
			)}

			<div className="flex items-center gap-3 text-sm">
				<button
					type="button"
					onClick={() => (isPlaying ? pause() : play())}
				>
					{isPlaying ? "Pause" : "Play"}
				</button>

				<span>
					{currentTime.toFixed(1)}s
					{totalTime !== null ? ` / ${totalTime.toFixed(1)}s` : ""}
				</span>

				<span>
					frame {currentFrame}
					{totalFrames !== null ? ` / ${totalFrames - 1}` : ` (${bufferedFrames} buffered)`}
				</span>

				<span>{measuredFps} fps</span>
			</div>
		</div>
	);
};
