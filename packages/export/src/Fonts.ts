import type { ResvgRenderOptions } from "@resvg/resvg-js";
import type * as Context from "effect/Context";
import { Fonts } from "effect-motion";

/**
 * Map a scene's declared fonts (the `Fonts` annotation) to resvg font
 * options: every entry with a `src.path` becomes a `fontFiles` entry.
 * Url-only entries are a browser concern and are skipped. System fonts
 * stay loaded (resvg's default) — declared fonts ADD faces; pass
 * `loadSystemFonts: false` yourself for fully self-contained output.
 */
export const resvgOptions = (scene: {
	readonly annotations: Context.Context<never>;
}): ResvgRenderOptions => {
	const fontFiles = Fonts.get(scene).flatMap((font) =>
		font.src.path === undefined ? [] : [font.src.path],
	);
	return fontFiles.length === 0 ? {} : { font: { fontFiles } };
};
