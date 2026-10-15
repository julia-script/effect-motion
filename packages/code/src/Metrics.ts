/**
 * Exact grid metrics from real font bytes.
 *
 * A SEPARATE entry point on purpose: this module is the only one that
 * touches `@text-rendering-toolkit/font` (HarfBuzz shaping, a ~390 KB WASM
 * asset), so blocks that declare their grid manually never load any of it.
 * Import from `@effect-motion/code/Metrics`, not the package root.
 *
 * Runs in userland preprocessing — next to where the font bytes already
 * live for the loader layer — never inside a scene body.
 */
import { loadFont } from "@text-rendering-toolkit/font";
import * as Effect from "effect/Effect";
import { EffectMotionError } from "effect-motion";
import type { Grid } from "./Code.js";

/**
 * Derive a monospace {@link Grid} from a font's actual metrics.
 *
 * @remarks
 * `charWidth` is the advance of `"0"` over `unitsPerEm` (in a monospace
 * font every glyph shares it); `lineHeight` is
 * `(ascender − descender + lineGap) / unitsPerEm`. Deterministic per font
 * bytes.
 *
 * @example
 * ```typescript
 * const bytes = await fetch(MONO_URL).then((r) => r.arrayBuffer());
 * const grid = await Effect.runPromise(
 * 	Metrics.gridFromFont(new Uint8Array(bytes)),
 * );
 * ```
 */
export const gridFromFont = (
	bytes: Uint8Array,
): Effect.Effect<Grid, EffectMotionError> =>
	Effect.tryPromise({
		try: async () => {
			const font = await loadFont(bytes);
			try {
				const run = font.shape({
					text: "0",
					direction: "ltr",
					script: "Latn",
					language: "und",
				});
				const advance = run.glyphs.reduce(
					(total, glyph) => total + glyph.xAdvance,
					0,
				);
				const { unitsPerEm, ascender, descender, lineGap } = font.facts;
				return {
					charWidth: advance / unitsPerEm,
					lineHeight: (ascender - descender + lineGap) / unitsPerEm,
				};
			} finally {
				font.dispose();
			}
		},
		catch: (cause) =>
			EffectMotionError.of(
				"Code: gridFromFont could not read the font's metrics",
				cause,
			),
	});
