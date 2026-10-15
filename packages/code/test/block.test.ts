import { parser } from "@lezer/javascript";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";
import { describe, expect, it } from "vitest";
import * as Code from "../src/Code.js";
import * as Highlight from "../src/Highlight.js";
import { framesOf, textsOf } from "./support/frames.js";
import { unreachable } from "./support/raise.js";

const grid = { charWidth: 0.6, lineHeight: 1.4 } as const;
const fontSize = 20;
const ink = Color.rgba(220, 220, 230);

const options = (code: string): Code.BlockOptions => ({
	code,
	parser,
	theme: Highlight.defaultTheme,
	fontSize,
	grid,
	fillColor: ink,
});

describe("Code.block", () => {
	it("instantiates one Text per line at its grid offset, spans sliced", async () => {
		const source = 'const a = 1;\n\nconst b = "hi";';
		const frames = await framesOf(function* () {
			yield* Code.block(options(source));
			yield* Scene.tick;
		});
		const frame = frames.at(-1) ?? unreachable();
		const texts = textsOf(frame);
		expect(texts).toHaveLength(3);
		const byLine = [...texts].sort((a, b) => b.position.y - a.position.y);
		for (const [line, text] of byLine.entries()) {
			expect(text.position.y).toBeCloseTo(
				-line * grid.lineHeight * fontSize,
				8,
			);
			expect(text.position.x).toBe(0);
			expect(text.baseline).toBe("hanging");
		}
		// line 0 has a keyword span at its own local offset
		const first = byLine[0] ?? unreachable();
		expect(first.text).toBe("const a = 1;");
		expect(first.spans?.[0]).toMatchObject({ from: 0, to: 5 });
		// the empty line is a Text too — one per source line, always
		expect(byLine[1]?.text).toBe("");
		// line 2's string span is re-based to line-local indices
		const third = byLine[2] ?? unreachable();
		expect(third.text).toBe('const b = "hi";');
		expect(
			third.spans?.some(
				(span) => span.from === third.text.indexOf('"') && span.to === 14,
			),
		).toBe(true);
	});

	it("the whole block animates through standard animators", async () => {
		const frames = await framesOf(function* () {
			const block = yield* Code.block(options("const a = 1;"));
			yield* Motion.moveTo(block.group, { x: 100, y: 50 }, "100 millis");
			yield* Motion.fadeTo(block.group, 0.5, "100 millis");
		});
		const frame = frames.at(-1) ?? unreachable();
		const group = Object.entries(frame.instances)
			.filter(([id]) => id !== frame.root)
			.map(([, entry]) => entry.data)
			.find((data) => data._tag === "Group");
		expect(group?.position).toMatchObject({ x: 100, y: 50 });
		expect(group?.opacity).toBe(0.5);
	});

	it("a long line stays a single Text — lines never wrap", async () => {
		const long = `const wide = "${"x".repeat(400)}";`;
		const frames = await framesOf(function* () {
			yield* Code.block(options(long));
			yield* Scene.tick;
		});
		const texts = textsOf(frames.at(-1) ?? unreachable());
		expect(texts).toHaveLength(1);
		expect(texts[0]?.text).toBe(long);
	});

	it("tab characters are a loud defect naming the fix", async () => {
		await expect(
			framesOf(function* () {
				yield* Code.block(options("\tconst a = 1;"));
			}),
		).rejects.toThrow(/tab characters/);
	});

	it("block position offsets the whole grid", async () => {
		const frames = await framesOf(function* () {
			yield* Code.block({
				...options("a\nb"),
				position: Entity.vec3({ x: -200, y: 150 }),
			});
			yield* Scene.tick;
		});
		const frame = frames.at(-1) ?? unreachable();
		const group = Object.entries(frame.instances)
			.filter(([id]) => id !== frame.root)
			.map(([, entry]) => entry.data)
			.find((data) => data._tag === "Group");
		expect(group?.position).toMatchObject({ x: -200, y: 150 });
		// children stay in local grid coordinates
		const texts = textsOf(frame);
		expect(texts.some((text) => text.position.y === 0)).toBe(true);
	});
});
