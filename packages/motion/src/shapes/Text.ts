import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Entity from "../Entity";
import * as Shape2D from "./Shape2D";

export type TextInline =
	| { readonly type: "text"; readonly value: string; readonly color?: string }
	| {
			readonly type: "strong";
			readonly children: ReadonlyArray<TextInline>;
			readonly color?: string;
	  }
	| {
			readonly type: "emphasis";
			readonly children: ReadonlyArray<TextInline>;
			readonly color?: string;
	  };

export type TextParagraph = {
	readonly type: "paragraph";
	readonly children: ReadonlyArray<TextInline>;
};

export type TextContent =
	| string
	| {
			readonly type: "root";
			readonly children: ReadonlyArray<TextParagraph>;
	  };

export const TextInline: Schema.Codec<TextInline> = Schema.suspend(
	(): Schema.Codec<TextInline> =>
		Schema.Union([
			Schema.Struct({
				type: Schema.Literal("text"),
				value: Schema.String,
				color: Schema.optionalKey(Schema.String),
			}),
			Schema.Struct({
				type: Schema.Literal("strong"),
				children: Schema.Array(TextInline),
				color: Schema.optionalKey(Schema.String),
			}),
			Schema.Struct({
				type: Schema.Literal("emphasis"),
				children: Schema.Array(TextInline),
				color: Schema.optionalKey(Schema.String),
			}),
		]),
);

export const TextParagraph: Schema.Codec<TextParagraph> = Schema.Struct({
	type: Schema.Literal("paragraph"),
	children: Schema.Array(TextInline),
});

export const TextContent: Schema.Codec<TextContent> = Schema.Union([
	Schema.String,
	Schema.Struct({
		type: Schema.Literal("root"),
		children: Schema.Array(TextParagraph),
	}),
]);

/**
 * SVG `<text>` content with optional inline bold, italic, and colored spans.
 *
 * `text` is required. The engine cannot measure text, so alignment is
 * delegated to SVG via `textAnchor` / `baseline`.
 */
export const Text = Entity.make(
	"shapes/Text",
	{
		...Shape2D.filled,
		text: TextContent,
		// numeric, therefore tweenable: tweenTo({ fontSize }) just works
		fontSize: Shape2D.defaultedNumber(16),
		// the generic family resolves to a sane system sans on every
		// platform — no bet on a named font existing
		fontFamily: Schema.String.pipe(
			Schema.withConstructorDefault(Effect.succeed("sans-serif")),
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
