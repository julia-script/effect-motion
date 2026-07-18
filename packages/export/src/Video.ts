import { Font, Session, type ThorvgException } from "@effect-motion/thorvg";
import { EngineNode } from "@effect-motion/thorvg/node";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import type { ChildProcessSpawner } from "effect/unstable/process";
import { Fonts, Renderer, Scene } from "effect-motion";
import * as PngExporter from "effect-motion/PngExporter";
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
	/** Scene framerate/dimensions/maxFrames for this export. */
	readonly settings?: VideoSceneSettings;
}

// The ThorVG engine (global font registry) plus a render session (the canvas
// Renderer.render draws each frame onto). The session canvas is resized per
// frame, so the seed size only has to be valid — the settings dimensions when
// given, else a 1×1 placeholder the first frame's resize corrects.
const fontedLayer = (
	scene: { readonly annotations: Context.Context<never> },
	settings: VideoSceneSettings | undefined,
) => {
	const fonts = {
		"sans-serif": Font.DEFAULT_FONT_URL,
		...Fonts.urlMap(scene),
	};
	return Layer.provideMerge(
		Session.layer({
			width: settings?.width ?? 1,
			height: settings?.height ?? 1,
			fonts,
		}),
		EngineNode.layer("sw", fonts),
	);
};

/**
 * Render a scene to a video file at `outPath`.
 *
 * Fails with {@link Ffmpeg.EncodeError} on odd output dimensions (invalid for
 * `yuv420p`) — before any ffmpeg process is spawned — or on an ffmpeg failure;
 * a ThorVG render failure surfaces as `ThorvgException`.
 */
export const render = <E, R>(
	scene: Scene.Scene<E, R>,
	outPath: string,
	options: VideoOptions = {},
): Effect.Effect<
	void,
	E | Ffmpeg.EncodeError | ThorvgException,
	// the scene is run to completion internally, so its Scope is discharged
	// here; the ThorVG engine is provided internally too
	| Exclude<R, Scope.Scope | SceneInternalR>
	| ChildProcessSpawner.ChildProcessSpawner
> =>
	Effect.scoped(
		Effect.gen(function* () {
			let frames = Scene.stream(
				scene as never,
				options.settings ?? {},
			) as Stream.Stream<Scene.Frame, E>;
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
					meta.width % 2 !== 0
						? `width ${meta.width}`
						: `height ${meta.height}`;
				return yield* new Ffmpeg.EncodeError({
					message:
						`Video dimensions must be even for yuv420p, got ${odd}. ` +
						`Use even scene dimensions, or pass extraArgs with a scale filter.`,
					stderr: "",
					cause: meta,
				});
			}

			const allFrames = Stream.concat(Stream.make(meta), rest);
			// each frame is rasterized to a framebuffer by the ThorVG renderer
			// then PNG-encoded. Rasterization is serial: Renderer.render mutates
			// one shared RenderSession canvas per frame (resize/clear/draw/read),
			// so concurrent renders would clobber each other's pixels.
			const pngStream = Stream.mapEffect(allFrames, (frame) =>
				Renderer.render(frame).pipe(Effect.flatMap(PngExporter.toBuffer)),
			);

			yield* Ffmpeg.encode(pngStream as Stream.Stream<Uint8Array>, outPath, {
				frameRate: meta.frameRate,
				binary: options.binary,
				extraArgs: options.extraArgs,
			});
		}),
	).pipe(
		// the scene's declared url fonts, merged over the default sans, so text
		// in a declared family renders (design D3); path-only entries skipped.
		// Fonts go to both the engine (global registry) and the render session.
		Effect.provide(fontedLayer(scene, options.settings)),
	) as unknown as Effect.Effect<
		void,
		E | Ffmpeg.EncodeError | ThorvgException,
		| Exclude<R, Scope.Scope | SceneInternalR>
		| ChildProcessSpawner.ChildProcessSpawner
	>;
