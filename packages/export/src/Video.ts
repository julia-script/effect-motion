import type { ThorvgException } from "@effect-motion/thorvg";
import { ThorvgWasmNode } from "@effect-motion/thorvg/node";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import type { ChildProcessSpawner } from "effect/unstable/process";
import { type Entity, Render, Scene } from "effect-motion";
import { renderToPng } from "effect-motion/render-node";
import * as Ffmpeg from "./Ffmpeg";

// Scene.instantiate/tick leak the runner requirement into a scene's static R,
// and Scene.make adds Scope; both are provided at runtime (by Scene.stream and
// this function's own Effect.scoped). Scene.tick's requirement IS that runner
// service, so subtract it (and Scope) from the public return type.
type SceneRunner =
	typeof Scene.tick extends Effect.Effect<unknown, unknown, infer RR>
		? RR
		: never;
type SceneInternalR = SceneRunner | Scope.Scope;

/**
 * The one-call export path: a scene becomes a video file. Composes the whole
 * pipeline — `Scene.stream` → ThorVG PNG renderer → ffmpeg — reading the
 * framerate and dimensions from the scene's own frame metadata. The ThorVG
 * engine is acquired internally (Node SW layer), so callers wire nothing.
 */

/**
 * Scene settings honored by the export path — a subset of the runner's
 * settings, passed through to `Scene.stream`. Framerate and dimensions set
 * here become the video's framerate and dimensions.
 */
export interface VideoSceneSettings {
	readonly frameRate?: number;
	readonly width?: number;
	readonly height?: number;
	/** Set to `Infinity` for an intentionally infinite scene (with `frames`). */
	readonly maxFrames?: number;
}

/** Options for {@link render}. */
export interface VideoOptions {
	/**
	 * Cap the number of frames encoded. WITHOUT it, a scene that never ends
	 * produces an encode that never ends — an infinite scene must set this.
	 */
	readonly frames?: number;
	/**
	 * ffmpeg binary; defaults to the bundled `ffmpeg-static` build (falls
	 * back to `"ffmpeg"` on PATH). Pass `"ffmpeg"` or a path for a
	 * system/custom ffmpeg.
	 */
	readonly binary?: string;
	/** Extra ffmpeg arguments, appended before the output path. */
	readonly extraArgs?: ReadonlyArray<string>;
	/** How many frames to rasterize concurrently (order preserved). Default 4. */
	readonly concurrency?: number;
	/** Scene framerate/dimensions/maxFrames for this export. */
	readonly settings?: VideoSceneSettings;
}

/**
 * Render a scene to a video file at `outPath`.
 *
 * Fails with {@link Ffmpeg.EncodeError} on odd output dimensions (invalid for
 * `yuv420p`) — before any ffmpeg process is spawned — or on an ffmpeg failure;
 * a ThorVG render failure surfaces as `ThorvgException`.
 */
export const render = <E, R, Entities extends Entity.AnyEntity>(
	scene: Scene.Scene<E, R, Entities>,
	outPath: string,
	options: VideoOptions = {},
): Effect.Effect<
	void,
	E | Ffmpeg.EncodeError | ThorvgException,
	// the scene is run to completion internally, so its Scope is discharged
	// here; the ThorVG engine is provided internally too
	Exclude<R, Scope.Scope | SceneInternalR> | ChildProcessSpawner.ChildProcessSpawner
> =>
	Effect.scoped(
		Effect.gen(function* () {
			const concurrency = options.concurrency ?? 4;

			let frames = Scene.stream(
				scene as never,
				options.settings ?? {},
			) as Stream.Stream<Scene.Frame<Entities>, E>;
			if (options.frames !== undefined) {
				frames = Stream.take(frames, options.frames);
			}

			// peel the first frame for metadata (framerate → ffmpeg -framerate,
			// dimensions → yuv420p even-size check) before spawning ffmpeg
			const [first, rest] = yield* Stream.peel(frames, Sink.head());
			if (first._tag === "None") {
				return; // empty scene: nothing to encode
			}
			const meta = first.value;

			if (meta.width % 2 !== 0 || meta.height % 2 !== 0) {
				const odd =
					meta.width % 2 !== 0 ? `width ${meta.width}` : `height ${meta.height}`;
				return yield* new Ffmpeg.EncodeError({
					message:
						`Video dimensions must be even for yuv420p, got ${odd}. ` +
						`Use even scene dimensions, or pass extraArgs with a scale filter.`,
					stderr: "",
					cause: meta,
				});
			}

			const allFrames = Stream.concat(Stream.make(meta), rest);
			// each frame is rasterized to PNG by the ThorVG renderer; the engine
			// (provided below) is shared across the whole stream.
			const pngStream = Stream.mapEffect(
				allFrames,
				(frame) => renderToPng(frame as never, Render.builtinPaints),
				{ concurrency },
			);

			yield* Ffmpeg.encode(pngStream as Stream.Stream<Uint8Array>, outPath, {
				frameRate: meta.frameRate,
				binary: options.binary,
				extraArgs: options.extraArgs,
			});
		}),
	).pipe(Effect.provide(ThorvgWasmNode.layer("sw"))) as unknown as Effect.Effect<
		void,
		E | Ffmpeg.EncodeError | ThorvgException,
		Exclude<R, Scope.Scope | SceneInternalR> | ChildProcessSpawner.ChildProcessSpawner
	>;
