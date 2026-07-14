import * as Context from "effect/Context";

/**
 * One loadable font face. `family` is the name text entities reference in
 * `fontFamily`; `src` carries per-environment sources — browsers load
 * `url`, offline rasterizers read `path`. Consumers skip sources they
 * can't use. `weight`/`style` are browser variant-matching descriptors;
 * file-based rasterizers read them from the font file itself. Declare one
 * entry per face (e.g. Inter 400 and Inter 700 are two entries).
 */
export interface FontResource {
	readonly family: string;
	readonly src: { readonly url?: string; readonly path?: string };
	/** CSS font-weight (e.g. 400, 700) */
	readonly weight?: number;
	readonly style?: "normal" | "italic";
}

/**
 * Scene annotation key declaring the fonts a scene's text depends on:
 * `scene.annotate(Fonts.Fonts, [...])`. The runtime never reads it — the
 * engine cannot measure text, so fonts cannot affect frame data. Consumers
 * (the player, export tools) read it to prepare their environment before
 * rendering.
 */
export const Fonts = Context.Reference<ReadonlyArray<FontResource>>(
	"motion/Fonts",
	{ defaultValue: () => [] },
);

/** A scene's declared fonts — empty for scenes never annotated. */
export const get = (scene: {
	readonly annotations: Context.Context<never>;
}): ReadonlyArray<FontResource> => Context.get(scene.annotations, Fonts);
