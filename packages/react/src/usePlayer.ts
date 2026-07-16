import { DEFAULT_FONT_URL, loadFontsIntoEngine } from "@effect-motion/thorvg";
import * as Effect from "effect/Effect";
import * as Pull from "effect/Pull";
import * as Stream from "effect/Stream";
import { type Entity, Fonts, Render, Scene } from "effect-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_WASM_BASE, getRuntime } from "./runtime";

export type PlayerStatus = "loading" | "ready" | "error";

/**
 * Render a single frame onto a canvas through the shared ThorVG runtime. The
 * runtime acquires the engine once and reuses it; each call folds the frame
 * onto its own scoped canvas.
 *
 * The render runs async on the shared engine, THEN blits — but only if
 * `shouldBlit()` still returns true when the pixels are ready. That lets the
 * caller drop a stale frame's paint (a newer frame was requested meanwhile)
 * without interrupting the render mid-flight, which would leave the canvas on
 * the previous frame (latest-frame-wins, without blanking).
 */
export type RenderFrame = (
	frame: PlayerFrame,
	canvas: HTMLCanvasElement,
	shouldBlit: () => boolean,
) => void;

/** A scene as produced by `Scene.make`, requirements erased. */
// ponytail: the core's own tests erase scene generics the same way
// (`scene as never`); revisit if effect-motion ever exports a runnable
// scene alias.
export type AnyScene = Scene.Scene<unknown, unknown, Entity.AnyEntity>;

export type PlayerFrame = Scene.Frame<Entity.AnyEntity>;

export interface UsePlayerOptions {
	readonly seed?: number | string | undefined;
	/** frames per second of both the scene runner and the playback clock */
	readonly frameRate?: number | undefined;
	/** scene resolution, forwarded to the runner and stamped on frames */
	readonly width?: number | undefined;
	readonly height?: number | undefined;
	/** start playing as soon as the first frame is buffered */
	readonly autoPlay?: boolean | undefined;
	/**
	 * Base URL the ThorVG `.wasm` is fetched from. Defaults to a pinned CDN
	 * location (see runtime.ts) so the player works with no config; override
	 * when serving the asset locally or when offline/CSP-restricted. The engine
	 * is process-global, so the first player's value wins for the page.
	 */
	readonly wasmBaseUrl?: string | undefined;
}

export interface Player {
	readonly status: PlayerStatus;
	/** the failure value when `status` is "error" */
	readonly error: unknown;
	/** the frame to show right now (null while loading/error) */
	readonly currentFrame: PlayerFrame | null;
	/** current frame index */
	readonly frame: number;
	/** frames pulled from the scene so far */
	readonly bufferedFrames: number;
	/** null until the scene's stream completes (never, for infinite scenes) */
	readonly totalFrames: number | null;
	/** 0..1 — against totalFrames when known, else the buffered edge */
	readonly progress: number;
	readonly playing: boolean;
	readonly loop: boolean;
	readonly frameRate: number;
	readonly play: () => void;
	readonly pause: () => void;
	readonly toggle: () => void;
	readonly seek: (frame: number) => void;
	readonly setLoop: (loop: boolean) => void;
	/**
	 * Render a frame onto a canvas through the shared ThorVG engine. The `Player`
	 * calls this on frame change with a `shouldBlit` guard so a stale frame's
	 * paint is dropped once a newer frame is requested (latest-frame-wins).
	 */
	readonly renderFrame: RenderFrame;
}

/**
 * Prepare a scene for playback: pull frames from the scene's stream with a
 * read-ahead buffer and play them back on a rAF clock. Playback starts as
 * soon as the first frame is buffered, so long and infinite scenes play
 * without waiting for completion. Played frames are retained, so backward
 * seeking is free; forward seeking clamps to the buffered edge.
 */
export const usePlayer = (
	scene: AnyScene,
	options: UsePlayerOptions = {},
): Player => {
	const {
		seed,
		frameRate = 60,
		width,
		height,
		autoPlay = false,
		wasmBaseUrl = DEFAULT_WASM_BASE,
	} = options;
	// ponytail: the buffer is append-only and unbounded — infinite scenes
	// grow it forever; swap in a ring buffer with a re-run-from-0 story if
	// memory ever matters. buffer[i] never changes once present, so reading
	// it during render is safe.
	const bufferRef = useRef<Array<PlayerFrame>>([]);
	const [bufferedFrames, setBufferedFrames] = useState(0);
	const [totalFrames, setTotalFrames] = useState<number | null>(null);
	const [error, setError] = useState<unknown>(null);
	const [frame, setFrame] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [loop, setLoop] = useState(false);
	// the shared ThorVG engine acquires asynchronously on first use; the player
	// is not `ready` until it is available (which includes loading the scene's
	// declared fonts into the engine), and an acquisition failure (e.g. a
	// blocked wasm fetch) surfaces as the player's error rather than hanging.
	const [engineReady, setEngineReady] = useState(false);

	// the scene's declared url fonts, as the engine's family→url map. A failed
	// individual font load is a warning inside the engine, not an error here.
	// Memoized on its own JSON identity so it's a stable dependency (a fresh
	// object each render would re-run the engine/render effects needlessly).
	const fontsKey = JSON.stringify(Fonts.urlMap(scene));
	// biome-ignore lint/correctness/useExhaustiveDependencies: fontsKey is the value's identity
	const sceneFonts = useMemo(() => Fonts.urlMap(scene), [fontsKey]);

	// acquire the shared engine and ensure THIS scene's declared fonts are loaded
	// into it, then mark ready. The engine is a process-global singleton (shared
	// across players and SPA navigations), so fonts can't be loaded only at
	// acquire — a later scene's fonts would be missed. `loadFontsIntoEngine` runs
	// every mount and is idempotent (already-loaded families are skipped), so
	// each scene's fonts are present before it renders. `status` gates on it.
	useEffect(() => {
		let cancelled = false;
		const runtime = getRuntime(wasmBaseUrl, sceneFonts);
		// include the default sans so it loads even if the engine was first
		// acquired by a scene that overrode or omitted fonts
		const fonts = { "sans-serif": DEFAULT_FONT_URL, ...sceneFonts };
		runtime.runPromise(loadFontsIntoEngine(fonts)).then(
			() => {
				if (!cancelled) {
					setEngineReady(true);
				}
			},
			(err) => {
				if (!cancelled) {
					setError(err);
				}
			},
		);
		return () => {
			cancelled = true;
		};
	}, [wasmBaseUrl, sceneFonts]);

	// render a frame onto a canvas via the shared runtime. renderToCanvas needs
	// a Scope (per-frame canvas) which Effect.scoped discharges; the runtime
	// provides the engine. Forked so the Player can interrupt a superseded
	// frame's render (latest-frame-wins).
	const renderFrame = useCallback<RenderFrame>(
		(frame, canvas, shouldBlit) => {
			// render to a framebuffer async on the engine, then blit synchronously
			// — but skip the blit if a newer frame was requested meanwhile. The
			// render is never interrupted, so no half-drawn/blank canvas.
			getRuntime(wasmBaseUrl, sceneFonts).runFork(
				Render.renderFramebuffer(frame as never, Render.builtinPaints).pipe(
					Effect.scoped,
					Effect.flatMap((fb) =>
						Effect.sync(() => {
							if (shouldBlit()) {
								Render.blitToCanvas(fb, canvas);
							}
						}),
					),
					Effect.catchCause((cause: unknown) =>
						Effect.sync(() =>
							console.error("[effect-motion] frame render failed", cause),
						),
					),
				),
			);
		},
		// sceneFonts is memoized (stable across identical font sets); it only
		// matters on the first getRuntime (the runtime is a singleton)
		[wasmBaseUrl, sceneFonts],
	);

	// Fonts are loaded into the ThorVG engine at acquire (see the engine effect
	// above), not as browser FontFaces — the engine rasterizes text, so the DOM
	// FontFace API is irrelevant. Readiness gates on engineReady, which already
	// waits for the font loads.

	// latest-value refs keep the fill loop and the rAF clock out of effect
	// deps: neither should restart on every frame or buffer growth
	const autoPlayRef = useRef(autoPlay);
	autoPlayRef.current = autoPlay;
	const frameRef = useRef(frame);
	frameRef.current = frame;
	const totalRef = useRef(totalFrames);
	totalRef.current = totalFrames;
	const loopRef = useRef(loop);
	loopRef.current = loop;

	// fill loop: pull frames ahead of the playhead until the stream ends
	useEffect(() => {
		const controller = new AbortController();
		bufferRef.current = [];
		frameRef.current = 0;
		setBufferedFrames(0);
		setTotalFrames(null);
		setError(null);
		setFrame(0);
		setPlaying(false);
		const readAhead = 2 * frameRate;
		const frames = Scene.stream(scene as never, {
			frameRate,
			...(seed !== undefined && { seed }),
			...(width !== undefined && { width }),
			...(height !== undefined && { height }),
		}) as unknown as Stream.Stream<PlayerFrame>;
		const fill = Effect.gen(function* () {
			const pull = yield* Stream.toPull(frames);
			let first = true;
			while (true) {
				if (bufferRef.current.length - frameRef.current >= readAhead) {
					// ponytail: 50ms poll instead of demand signalling — the
					// condition changes at most once per played frame; wire a
					// real latch if the wakeups ever show up in a profile
					yield* Effect.sleep(50);
					continue;
				}
				const chunk = yield* pull;
				bufferRef.current.push(...chunk);
				setBufferedFrames(bufferRef.current.length);
				if (first) {
					first = false;
					if (autoPlayRef.current) {
						setPlaying(true);
					}
				}
			}
		}).pipe(
			// the pull signals stream end as a Done failure: the scene is finite
			Pull.catchDone(() =>
				Effect.sync(() => setTotalFrames(bufferRef.current.length)),
			),
			Effect.scoped,
		) as Effect.Effect<void>;
		Effect.runPromise(fill, { signal: controller.signal }).then(
			undefined,
			(err) => {
				// aborted means unmount/re-run: no state updates after that
				if (!controller.signal.aborted) {
					setError(err);
				}
			},
		);
		return () => controller.abort();
	}, [scene, seed, frameRate, width, height]);

	// playback clock: advance the index at frameRate while playing, clamped
	// to the buffered edge — playing at the live edge waits for frames
	useEffect(() => {
		if (!playing) {
			return;
		}
		const frameMs = 1000 / frameRate;
		let raf = 0;
		let last: number | null = null;
		let acc = 0;
		const tick = (now: number) => {
			if (last !== null) {
				acc += now - last;
				const advance = Math.floor(acc / frameMs);
				if (advance > 0) {
					acc -= advance * frameMs;
					setFrame((f) => {
						const buffered = bufferRef.current.length;
						if (buffered === 0) {
							return f;
						}
						let next = f + advance;
						const total = totalRef.current;
						if (total !== null && loopRef.current && next > total - 1) {
							next = next % total;
						}
						return Math.min(next, buffered - 1);
					});
				}
			}
			last = now;
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing, frameRate]);

	// auto-pause on the last frame of a completed stream (loop wraps instead)
	useEffect(() => {
		if (playing && !loop && totalFrames !== null && frame >= totalFrames - 1) {
			setPlaying(false);
		}
	}, [playing, loop, totalFrames, frame]);

	const play = useCallback(() => {
		if (bufferRef.current.length === 0) {
			return;
		}
		// replay: sitting on the last frame of a finished scene means start over
		setFrame((f) => {
			const total = totalRef.current;
			return total !== null && f >= total - 1 ? 0 : f;
		});
		setPlaying(true);
	}, []);

	const pause = useCallback(() => {
		setPlaying(false);
	}, []);

	const toggle = useCallback(() => {
		if (playing) {
			pause();
		} else {
			play();
		}
	}, [playing, play, pause]);

	const seek = useCallback((target: number) => {
		const buffered = bufferRef.current.length;
		if (buffered === 0) {
			return;
		}
		setFrame(Math.min(Math.max(0, Math.floor(target)), buffered - 1));
	}, []);

	const status: PlayerStatus =
		error !== null
			? "error"
			: bufferedFrames > 0 && engineReady
				? "ready"
				: "loading";
	const denominator = (totalFrames ?? bufferedFrames) - 1;

	return {
		status,
		error,
		currentFrame: bufferRef.current[frame] ?? null,
		frame,
		bufferedFrames,
		totalFrames,
		progress:
			denominator > 0
				? Math.min(frame / denominator, 1)
				: totalFrames !== null
					? 1
					: 0,
		playing,
		loop,
		frameRate,
		play,
		pause,
		toggle,
		seek,
		setLoop,
		renderFrame,
	};
};
