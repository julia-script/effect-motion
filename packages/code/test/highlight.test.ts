import { parser } from "@lezer/javascript";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import { describe, expect, it } from "vitest";
import * as Highlight from "../src/Highlight.js";

const code = 'const x = "hi"';

// Color instances carry a per-instance `pipe` function, so toEqual never
// matches two of them — compare data through a JSON round-trip instead
const plain = <A>(value: A): unknown => JSON.parse(JSON.stringify(value));

describe("Highlight.highlight", () => {
	it("tokenizes a snippet into themed spans", () => {
		const result = Highlight.highlight(code, parser, Highlight.defaultTheme);
		expect(result.text).toBe(code);
		// `const` is a keyword
		const keyword = result.spans.find((span) => span.from === 0);
		expect(keyword).toMatchObject({ from: 0, to: 5 });
		expect(plain(keyword?.fillColor)).toEqual(
			plain(Highlight.defaultTheme.keyword),
		);
		// `"hi"` is a string, quotes included
		const string = result.spans.find((span) => span.from === code.indexOf('"'));
		expect(string).toMatchObject({ to: code.length });
		expect(plain(string?.fillColor)).toEqual(
			plain(Highlight.defaultTheme.string),
		);
		// `x` is an unthemed variable — uncovered, falls to the entity fill
		expect(result.spans.some((span) => span.from <= 6 && 6 < span.to)).toBe(
			false,
		);
	});

	it("is deterministic: same inputs, deeply equal outputs", () => {
		const first = Highlight.highlight(code, parser, Highlight.defaultTheme);
		const second = Highlight.highlight(code, parser, Highlight.defaultTheme);
		expect(plain(second)).toEqual(plain(first));
	});

	it("merges adjacent same-colored tokens into maximal runs", () => {
		const mono = Color.hex("#ffffff");
		const result = Highlight.highlight("1+2", parser, {
			number: mono,
			operator: mono,
		});
		expect(result.spans).toHaveLength(1);
		expect(result.spans[0]).toMatchObject({ from: 0, to: 3 });
	});

	it("modified tags match through their base tag", () => {
		// `f` in a call position carries a modified variableName tag; theming
		// variableName still colors it
		const themed = Highlight.highlight("f(1)", parser, {
			variableName: Color.hex("#ff0000"),
		});
		expect(themed.spans.some((span) => span.from === 0 && span.to === 1)).toBe(
			true,
		);
	});

	it("produces spans a Text accepts", () => {
		const result = Highlight.highlight(code, parser, Highlight.defaultTheme);
		expect(() =>
			Entity.Text.make({ text: result.text, spans: result.spans }),
		).not.toThrow();
	});
});
