import * as Context from "effect/Context";

/**
 * One loadable image asset. `name` is what `Shapes.Image` entities reference
 * in their `image` field; `src` carries per-environment sources — browsers
 * load `url`, file-based tooling may read `path` (reserved; url-only today,
 * same contract as fonts). Consumers skip sources they can't use.
 */
export interface ImageResource {
	readonly name: string;
	readonly src: { readonly url?: string; readonly path?: string };
}

/**
 * Scene annotation key declaring the images a scene's Image entities depend
 * on: `scene.annotate(Images.Images, [...])`. The runtime never reads it —
 * decoded pixels cannot affect frame data. Consumers (the player, export
 * tools) read it to load assets into their render session before playback.
 */
export const Images = Context.Reference<ReadonlyArray<ImageResource>>(
	"motion/Images",
	{ defaultValue: () => [] },
);

/** A scene's declared images — empty for scenes never annotated. */
export const get = (scene: {
	readonly annotations: Context.Context<never>;
}): ReadonlyArray<ImageResource> => Context.get(scene.annotations, Images);

/**
 * A scene's declared images as a `name -> url` map for the render session's
 * `images` option. Only entries with a `src.url` are included — loading is
 * fetch-by-URL (no filesystem), so `path`-only entries are skipped.
 */
export const urlMap = (scene: {
	readonly annotations: Context.Context<never>;
}): Record<string, string> => {
	const out: Record<string, string> = {};
	for (const image of get(scene)) {
		if (image.src.url !== undefined) {
			out[image.name] = image.src.url;
		}
	}
	return out;
};
