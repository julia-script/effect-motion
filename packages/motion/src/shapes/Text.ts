import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Entity from "../Entity";
import * as Shape2D from "./Shape2D";

/**
 * A single-line, single-style text run mirroring SVG `<text>`.
 *
 * `text` is required — empty text can never be visible, so there is no
 * sensible default (same rationale as Path's `d`). The engine cannot
 * measure text, so alignment is delegated to SVG via `textAnchor` /
 * `baseline` — `{ textAnchor: "middle", baseline: "middle" }` centers on
 * x/y. Rich text (styled runs, wrapping) will be a separate entity; this
 * one stays a single run.
 */
export const Text = Entity.make(
	"shapes/Text",
	{
		...Shape2D.filled,
		text: Schema.String,
		// numeric, therefore tweenable: tweenTo({ fontSize }) just works
		fontSize: Shape2D.defaultedNumber(16),
		// the generic family resolves to a sane system sans on every
		// platform — no bet on a named font existing
		fontFamily: Schema.String.pipe(
			Schema.withConstructorDefault(Effect.succeed("sans-serif")),
		),
		textAnchor: Schema.optionalKey(
			Schema.Literals(["start", "middle", "end"]),
		),
		baseline: Schema.optionalKey(
			Schema.Literals(["auto", "middle", "hanging"]),
		),
	},
	{
		"~position": Shape2D.positionLens(),
		"~opacity": Shape2D.opacityLens(),
	},
);
