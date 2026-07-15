import { Resvg as ResvgJs, type ResvgRenderOptions } from "@resvg/resvg-js";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import type * as PlatformError from "effect/PlatformError";

/**
 * Thin Effect wrappers over resvg. Rasterization is an export tool, not a
 * renderer: it consumes the SVG document strings the string sink produces
 * (or any other SVG) and yields PNG bytes.
 */

/** resvg's own options, untranslated — font config and fitTo live here */
export type { ResvgRenderOptions } from "@resvg/resvg-js";

/** A failure raised by resvg while parsing or rendering an SVG document. */
export class RasterizeError extends Data.TaggedError("RasterizeError")<{
	readonly cause: unknown;
}> {}

/**
 * Rasterize an SVG document string to PNG bytes. Output dimensions come
 * from the document itself; the string sink stamps the frame's
 * width/height on the root.
 */
export const rasterize = (
	svg: string,
	options?: ResvgRenderOptions,
): Effect.Effect<Uint8Array, RasterizeError> =>
	Effect.try({
		try: () =>
			new Uint8Array(new ResvgJs(svg, options ?? null).render().asPng()),
		catch: (cause) => new RasterizeError({ cause }),
	});

/** `rasterize`, then persist through the FileSystem service. */
export const rasterizeToFile = (
	svg: string,
	path: string,
	options?: ResvgRenderOptions,
): Effect.Effect<
	void,
	RasterizeError | PlatformError.PlatformError,
	FileSystem.FileSystem
> =>
	Effect.gen(function* () {
		const bytes = yield* rasterize(svg, options);
		const fs = yield* FileSystem.FileSystem;
		yield* fs.writeFile(path, bytes);
	});
