import * as NodeRenderer from "@effect-motion/renderer/node";
import type { ThreeException } from "@effect-motion/three";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import type { ChildProcessSpawner } from "effect/unstable/process";
import { type Resource, Scene } from "effect-motion";
import * as Ffmpeg from "./Ffmpeg.js";

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
 * pipeline — `Scene.stream` → three GPU renderer (Dawn) → PNG → ffmpeg —
 * reading the framerate and dimensions from the scene's own frame metadata.
 * The renderer is acquired internally, so callers wire nothing.
 *
 * ponytail: frames rasterize serially (sync → render → readback per frame);
 * readback being async allows pipelining ahead of the encoder if it ever
 * becomes the bottleneck.
 */

/**
 * Playback settings honored by the export path — a subset of the runner's
 * settings, passed through to `Scene.stream`. The video's dimensions come
 * from the SCENE's own composition config (`Scene.make(gen, { width, height })`);
 * a framerate set here becomes the video's framerate.
 */
export interface VideoSceneSettings {
	readonly frameRate?: number;
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
	/**
	 * Supersampling factor: frames are rendered at scene dimensions × dpr
	 * (the video's pixel size) while the scene keeps its authored logical
	 * coordinates and framing. Defaults to 1.
	 */
	readonly dpr?: number;
	/** Scene framerate/dimensions/maxFrames for this export. */
	readonly settings?: VideoSceneSettings;
}

/**
 * Render a scene to a video file at `outPath`.
 *
 * Fails with {@link Ffmpeg.EncodeError} on odd output dimensions (invalid for
 * `yuv420p`) — before any ffmpeg process is spawned — or on an ffmpeg failure;
 * a GPU render failure surfaces as `ThreeException`.
 */
export const render = <E = never, LoaderR = never>(
	scene: Scene.Scene<E, SceneInternalR | LoaderR>,
	outPath: string,
	options: VideoOptions = {},
): Effect.Effect<
	void,
	E | Ffmpeg.EncodeError | ThreeException,
	// the scene is run to completion internally, so its Scope is discharged
	// here; the GPU renderer is provided internally too. The scene's
	// resource loaders stay the CALLER's requirement — provide them via
	// Font.layer/Image.layer (Node fs loaders work here: no URLs needed)
	ChildProcessSpawner.ChildProcessSpawner | Resource.ExtractLoaders<LoaderR>
> =>
	Effect.scoped(
		Effect.gen(function* () {
			let frames = Scene.stream(scene, options.settings ?? {});
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

			// the encoded pixel size is the logical scene size × dpr; that is
			// what yuv420p needs even, not the logical size
			const dpr = options.dpr ?? 1;
			const outWidth = Math.round(meta.width * dpr);
			const outHeight = Math.round(meta.height * dpr);
			if (outWidth % 2 !== 0 || outHeight % 2 !== 0) {
				const odd =
					outWidth % 2 !== 0 ? `width ${outWidth}` : `height ${outHeight}`;
				return yield* new Ffmpeg.EncodeError({
					message:
						`Video dimensions must be even for yuv420p, got ${odd}. ` +
						`Use even scene dimensions (× dpr), or pass extraArgs with a scale filter.`,
					stderr: "",
					cause: meta,
				});
			}

			// one renderer for the whole export, sized from the first frame's
			// metadata, released with this scope
			const renderer = yield* NodeRenderer.make({
				width: meta.width,
				height: meta.height,
				pixelRatio: dpr,
			});

			const allFrames = Stream.concat(Stream.make(meta), rest);
			// serial by construction: syncFrame mutates one retained scene, so
			// concurrent renders would clobber each other's state
			const pngStream = Stream.mapEffect(allFrames, (frame) =>
				renderer.renderToPng(frame),
			);

			// writing a file implies its directory: create the output's parent
			// so render programs carry no mkdir boilerplate (Node-only module,
			// no new requirement)
			yield* Effect.promise(async () => {
				const { mkdir } = await import("node:fs/promises");
				const { dirname } = await import("node:path");
				await mkdir(dirname(outPath), { recursive: true });
			});

			yield* Ffmpeg.encode(pngStream as Stream.Stream<Uint8Array>, outPath, {
				frameRate: meta.frameRate,
				binary: options.binary,
				extraArgs: options.extraArgs,
			});
		}),
		// the Exclude-chain the pipeline infers over the unresolved LoaderR
		// can't be proven equal to the declared surface; the runtime shape is
		// exactly it (loaders in, loaders out — everything else provided here)
	) as Effect.Effect<
		void,
		E | Ffmpeg.EncodeError | ThreeException,
		ChildProcessSpawner.ChildProcessSpawner | Resource.ExtractLoaders<LoaderR>
	>;
