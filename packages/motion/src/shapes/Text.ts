import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Entity from "../Entity.js";
import * as Font from "../Font.js";
import * as Shape2D from "./Shape2D.js";

/**
 * A plain-string text leaf. `text` is required. The engine cannot measure
 * text, so alignment is delegated to SVG via `textAnchor` / `baseline`.
 * Inline formatting and multi-run styling are expressed by composing
 * multiple `Text` instances (via `children`), not by an in-engine tree.
 */
export const Text = Entity.make(
	"shapes/Text",
	{
		...Shape2D.filled,
		text: Schema.String,
		// numeric, therefore tweenable: tweenTo({ fontSize }) just works
		fontSize: Shape2D.defaultedNumber(16),
		// a Font resource reference ({_tag, id}), never a bare string.
		// Defaults to the built-in default font (reserved id "sans-serif",
		// auto-provided by the render path) — bare Text and string children
		// stay zero-ceremony, and no yield* happens so the default never
		// enters the scene's loader requirements.
		fontFamily: Font.schema.pipe(
			Schema.withConstructorDefault(
				Effect.sync(() => Font.schema.make({ id: Font.defaultFont.id })),
			),
		),
		textAnchor: Schema.optionalKey(Schema.Literals(["start", "middle", "end"])),
		baseline: Schema.optionalKey(
			Schema.Literals(["auto", "middle", "hanging"]),
		),
	},
	{
		"~position": Shape2D.positionLens(),
		"~opacity": Shape2D.opacityLens(),
	},
);
