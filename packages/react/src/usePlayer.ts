import * as Effect from "effect/Effect";
import * as Pull from "effect/Pull";
import * as Stream from "effect/Stream";
import { type Entity, Scene } from "effect-motion";
import { useCallback, useEffect, useRef, useState } from "react";

export type PlayerStatus = "loading" | "ready" | "error";

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
	const { seed, frameRate = 60, width, height, autoPlay = false } = options;
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
		error !== null ? "error" : bufferedFrames > 0 ? "ready" : "loading";
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
	};
};
