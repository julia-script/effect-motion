import { parser } from "@lezer/javascript";
import * as Color from "effect-motion/Color";
import * as Scene from "effect-motion/Scene";
import { describe, expect, it } from "vitest";
import * as Code from "../src/Code.js";
import * as Highlight from "../src/Highlight.js";
import * as Selection from "../src/Selection.js";
import { framesOf, textsOf } from "./support/frames.js";
import { unreachable } from "./support/raise.js";

const grid = { charWidth: 0.6, lineHeight: 1.4 } as const;
const fontSize = 20;
const ink = Color.rgba(220, 220, 230);
const background = Color.rgba(22, 22, 29);

const plain = <A>(value: A): unknown =>
	JSON.parse(JSON.stringify(value ?? null));

const source = 'const a = "one";\nconst b = "two";';
// select from "one" through the second const — crosses the newline
const range = {
	from: source.indexOf('"one"'),
	to: source.indexOf(" b "),
} as const;

describe("Code.selectTo", () => {
	it("a multi-line range keeps color across lines while the rest dims", async () => {
		const frames = await framesOf(function* () {
			const block = yield* Code.block({
				code: source,
				parser,
				theme: Highlight.defaultTheme,
				fontSize,
				grid,
				fillColor: ink,
			});
			yield* Code.selectTo(block, [range], {
				duration: "200 millis",
				background,
			});
		});
		const frame = frames.at(-1) ?? unreachable();
		const lines = [...textsOf(frame)].sort(
			(a, b) => b.position.y - a.position.y,
		);
		const [first, second] = [
			lines[0] ?? unreachable(),
			lines[1] ?? unreachable(),
		];

		// line 0: the string "one" is inside the selection and keeps its color
		const stringStart = first.text.indexOf('"');
		const keptString = first.spans?.find((span) => span.from === stringStart);
		expect(plain(keptString?.fillColor)).toEqual(
			plain(Highlight.defaultTheme.string),
		);
		// line 0: the keyword sits OUTSIDE the selection and dims
		const keyword = Highlight.defaultTheme.keyword ?? unreachable();
		const dimmedKeyword = first.spans?.find((span) => span.from === 0);
		expect(plain(dimmedKeyword?.fillColor)).toEqual(
			plain(Color.mix(keyword, background, 0.7, "lab")),
		);
		// line 1: "const" is INSIDE the selection (it ends at " b ") and keeps
		const keptKeyword = second.spans?.find((span) => span.from === 0);
		expect(plain(keptKeyword?.fillColor)).toEqual(plain(keyword));
		// line 1: the string "two" is outside and dims
		const dimmedString = second.spans?.find(
			(span) => span.from === second.text.indexOf('"'),
		);
		expect(plain(dimmedString?.fillColor)).toEqual(
			plain(
				Color.mix(
					Highlight.defaultTheme.string ?? unreachable(),
					background,
					0.7,
					"lab",
				),
			),
		);
	});

	it("lands frame-exactly on the per-line dim derivation", async () => {
		const frames = await framesOf(function* () {
			const block = yield* Code.block({
				code: source,
				parser,
				theme: Highlight.defaultTheme,
				fontSize,
				grid,
				fillColor: ink,
			});
			yield* Code.selectTo(block, [range], {
				duration: "200 millis",
				background,
			});
			yield* Scene.tick;
		});
		const frame = frames.at(-1) ?? unreachable();
		const lines = [...textsOf(frame)].sort(
			(a, b) => b.position.y - a.position.y,
		);
		// derive the expected line-0 target independently
		const line0 = source.split("\n")[0] ?? unreachable();
		const highlighted = Highlight.highlight(
			source,
			parser,
			Highlight.defaultTheme,
		);
		const line0Spans = highlighted.spans
			.filter((span) => span.to <= line0.length)
			.map((span) => ({
				from: span.from,
				to: span.to,
				fillColor: span.fillColor,
			}));
		const expected = Selection.dim(
			{ text: line0, spans: line0Spans.map((s) => s as never) },
			[{ from: range.from, to: line0.length }],
			{ background, baseColor: ink },
		);
		expect(plain(lines[0]?.spans)).toEqual(plain(expected.spans));
	});
});
