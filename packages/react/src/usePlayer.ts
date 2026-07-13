import * as Effect from "effect/Effect";
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
	/** start playing as soon as frames are collected */
	readonly autoPlay?: boolean | undefined;
}

export interface Player {
	readonly status: PlayerStatus;
	/** the failure value when `status` is "error" */
	readonly error: unknown;
	readonly frames: ReadonlyArray<PlayerFrame> | null;
	/** the frame to show right now (null while loading/error) */
	readonly currentFrame: PlayerFrame | null;
	/** current frame index */
	readonly frame: number;
	readonly totalFrames: number;
	/** 0..1, determinate once ready */
	readonly progress: number;
	readonly playing: boolean;
	readonly frameRate: number;
	readonly play: () => void;
	readonly pause: () => void;
	readonly toggle: () => void;
	readonly seek: (frame: number) => void;
}

/**
 * Prepare a scene for playback: run it to completion once (scenes are
 * deterministic and finite), then play the collected frames back on a
 * rAF clock. Pause, seek, and a determinate progress bar come free.
 */
export const usePlayer = (
	scene: AnyScene,
	options: UsePlayerOptions = {},
): Player => {
	const { seed, frameRate = 60, autoPlay = false } = options;
	const [frames, setFrames] = useState<ReadonlyArray<PlayerFrame> | null>(null);
	const [error, setError] = useState<unknown>(null);
	const [frame, setFrame] = useState(0);
	const [playing, setPlaying] = useState(false);

	// autoPlay only matters at the moment collection finishes; a ref keeps
	// it out of the collection effect's deps (toggling it must not re-run
	// the scene)
	const autoPlayRef = useRef(autoPlay);
	autoPlayRef.current = autoPlay;

	// collect all frames by running the scene to completion
	useEffect(() => {
		const controller = new AbortController();
		setFrames(null);
		setError(null);
		setFrame(0);
		setPlaying(false);
		const collect = Scene.stream(scene as never, {
			frameRate,
			...(seed !== undefined && { seed }),
		}).pipe(Stream.runCollect) as Effect.Effect<Array<PlayerFrame>>;
		Effect.runPromise(collect, { signal: controller.signal }).then(
			(collected) => {
				setFrames(collected);
				if (autoPlayRef.current) {
					setPlaying(true);
				}
			},
			(err) => {
				// aborted means unmount/re-run: no state updates after that
				if (!controller.signal.aborted) {
					setError(err);
				}
			},
		);
		return () => controller.abort();
	}, [scene, seed, frameRate]);

	// playback clock: advance the index at frameRate while playing
	useEffect(() => {
		if (!playing || frames === null || frames.length === 0) {
			return;
		}
		const frameMs = 1000 / frameRate;
		const lastIndex = frames.length - 1;
		let raf = 0;
		let last: number | null = null;
		let acc = 0;
		const loop = (now: number) => {
			if (last !== null) {
				acc += now - last;
				const advance = Math.floor(acc / frameMs);
				if (advance > 0) {
					acc -= advance * frameMs;
					setFrame((f) => Math.min(f + advance, lastIndex));
				}
			}
			last = now;
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [playing, frames, frameRate]);

	// auto-pause on the last frame
	useEffect(() => {
		if (
			playing &&
			frames !== null &&
			frames.length > 0 &&
			frame >= frames.length - 1
		) {
			setPlaying(false);
		}
	}, [playing, frames, frame]);

	const play = useCallback(() => {
		if (frames === null || frames.length === 0) {
			return;
		}
		// replay: sitting on the last frame means start over
		setFrame((f) => (f >= frames.length - 1 ? 0 : f));
		setPlaying(true);
	}, [frames]);

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

	const seek = useCallback(
		(target: number) => {
			if (frames === null || frames.length === 0) {
				return;
			}
			setFrame(Math.min(Math.max(0, Math.floor(target)), frames.length - 1));
		},
		[frames],
	);

	const totalFrames = frames?.length ?? 0;
	const status: PlayerStatus =
		error !== null ? "error" : frames !== null ? "ready" : "loading";

	return {
		status,
		error,
		frames,
		currentFrame: frames?.[frame] ?? null,
		frame,
		totalFrames,
		progress:
			totalFrames > 1 ? frame / (totalFrames - 1) : status === "ready" ? 1 : 0,
		playing,
		frameRate,
		play,
		pause,
		toggle,
		seek,
	};
};
