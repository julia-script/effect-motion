/**
 * Syntax highlighting for effect-motion Text: tokenize a code string with a
 * caller-supplied Lezer parser, map the tokens' highlight tags to colors
 * through a plain-object {@link Theme}, and emit `Text` span data.
 *
 * Everything here runs at AUTHORING time — a Lezer parse is pure and
 * deterministic, so the result is plain frame data and the renderer never
 * learns what a language is (the engine renders, it does not parse). The
 * language grammar is your own dependency:
 *
 * @example
 * ```typescript
 * import { parser } from "@lezer/javascript";
 * import * as Highlight from "@effect-motion/code/Highlight";
 * import * as Scene from "effect-motion/Scene";
 *
 * const snippet = Highlight.highlight(
 * 	'const x = "hi"',
 * 	parser,
 * 	Highlight.defaultTheme,
 * );
 *
 * const scene = Scene.make(function* () {
 * 	yield* Scene.instantiate("Text", { ...snippet, fontSize: 24 });
 * });
 * ```
 */
import type { Parser } from "@lezer/common";
import { highlightTree, Tag, tags } from "@lezer/highlight";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";

/**
 * A theme: highlight-tag names (`keyword`, `string`, `comment`, …, the
 * standard `@lezer/highlight` tag set) to Colors. Plain serializable data —
 * write one as an object literal. Tokens whose tag has no entry produce no
 * span and fall back to the Text's own `fillColor`.
 */
export type Theme = Readonly<Record<string, Color.Color>>;

/** A highlighted code string, spreadable into a Text's `text`/`spans`. */
export interface Highlighted {
	readonly text: string;
	readonly spans: ReadonlyArray<Entity.Span>;
}

// the standard tags, invertible: Tag → its theme-key name. Entries that are
// modifiers (`function`, `definition`, …) are functions, not Tags, and are
// deliberately not theme keys — a modified tag still matches through its
// base tag's membership in `tag.set`.
const namesByTag: ReadonlyMap<Tag, string> = new Map(
	Object.entries(tags).flatMap(([name, value]) =>
		value instanceof Tag ? [[value, name]] : [],
	),
);

/** The first themed name for a node's tag set, most specific tag first. */
const themedName = (
	nodeTags: ReadonlyArray<Tag>,
	theme: Theme,
): string | null => {
	for (const tag of nodeTags) {
		// tag.set walks the tag plus its bases, specific → general
		for (const candidate of tag.set) {
			const name = namesByTag.get(candidate);
			if (name !== undefined && theme[name] !== undefined) {
				return name;
			}
		}
	}
	return null;
};

const sameColor = (a: Color.Color, b: Color.Color): boolean => {
	if (a === b) {
		return true;
	}
	const left = Color.bytes(a);
	const right = Color.bytes(b);
	return (
		left.r === right.r &&
		left.g === right.g &&
		left.b === right.b &&
		left.a === right.a
	);
};

/**
 * Tokenize `code` with `parser` and color it through `theme`.
 *
 * @remarks
 * Returns `{ text, spans }` ready to spread into a Text. Spans are maximal
 * runs of same-colored adjacent tokens; unthemed tokens (and whitespace)
 * are uncovered and paint in the entity's `fillColor`. Deterministic: the
 * same code, parser, and theme always produce the same spans.
 *
 * @param code - The source to highlight.
 * @param parser - A Lezer parser — your own language dependency
 *   (`@lezer/javascript`, `@lezer/python`, …).
 * @param theme - Tag-name → Color map; see {@link defaultTheme}.
 */
export const highlight = (
	code: string,
	parser: Parser,
	theme: Theme,
): Highlighted => {
	const tree = parser.parse(code);
	const spans: Array<Entity.Span> = [];
	highlightTree(
		tree,
		{ style: (nodeTags) => themedName(nodeTags, theme) },
		(from, to, name) => {
			const fillColor = theme[name];
			if (fillColor === undefined) {
				return;
			}
			const previous = spans.at(-1);
			if (
				previous !== undefined &&
				previous.to === from &&
				sameColor(previous.fillColor, fillColor)
			) {
				spans[spans.length - 1] = Entity.Span.make({
					from: previous.from,
					to,
					fillColor,
				});
			} else {
				spans.push(Entity.Span.make({ from, to, fillColor }));
			}
		},
	);
	return { text: code, spans };
};

/**
 * A ready-to-use dark theme (One-Dark-leaning). Identifiers are deliberately
 * unthemed so plain code paints in the Text's own `fillColor` — pair it with
 * a light `fillColor` on a dark backdrop.
 */
export const defaultTheme: Theme = {
	keyword: Color.hex("#c678dd"),
	string: Color.hex("#98c379"),
	regexp: Color.hex("#98c379"),
	number: Color.hex("#d19a66"),
	bool: Color.hex("#d19a66"),
	null: Color.hex("#d19a66"),
	comment: Color.hex("#7f848e"),
	typeName: Color.hex("#e5c07b"),
	className: Color.hex("#e5c07b"),
	propertyName: Color.hex("#61afef"),
	operator: Color.hex("#56b6c2"),
};
