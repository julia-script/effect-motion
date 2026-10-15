import { parser } from "@lezer/javascript";
import * as Color from "effect-motion/Color";
import * as Scene from "effect-motion/Scene";
import { describe, expect, it } from "vitest";
import * as Code from "../src/Code.js";
import * as Highlight from "../src/Highlight.js";
import { cellMapOf, framesOf, textsOf } from "./support/frames.js";
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

const v1 = "const a = 1;\nconst b = 2;";
const v2 = "const a = 1;\nconst mid = a;\nconst b = 2;";

const editScene = function* () {
	const block = yield* Code.block(options(v1));
	yield* Scene.tick;
	yield* Code.editTo(block, v2, { duration: "500 millis" });
};

describe("Code.editTo", () => {
	it("the final frame equals a fresh block of the new source", async () => {
		const edited = await framesOf(editScene);
		const fresh = await framesOf(function* () {
			yield* Code.block(options(v2));
			yield* Scene.tick;
		});
		const editedCells = cellMapOf(
			edited.at(-1) ?? unreachable(),
			grid,
			fontSize,
		);
		const freshCells = cellMapOf(fresh.at(-1) ?? unreachable(), grid, fontSize);
		expect(Object.fromEntries(editedCells)).toEqual(
			Object.fromEntries(freshCells),
		);
	});

	it("consolidation is invisible: landed frame and final frame paint alike", async () => {
		const frames = await framesOf(editScene);
		// frames: [rest, 30 animation frames, scene-end (consolidated)]
		const landed = frames.at(-2) ?? unreachable();
		const consolidated = frames.at(-1) ?? unreachable();
		expect(Object.fromEntries(cellMapOf(consolidated, grid, fontSize))).toEqual(
			Object.fromEntries(cellMapOf(landed, grid, fontSize)),
		);
		// but the instances differ: fragments landed, lines consolidated
		expect(textsOf(consolidated).length).toBe(v2.split("\n").length);
	});

	it("the split does not jump: first animation frame stays within one step", async () => {
		const frames = await framesOf(editScene);
		const rest = cellMapOf(frames.at(0) ?? unreachable(), grid, fontSize);
		const firstStep = frames.at(1) ?? unreachable();
		// every rest-frame cell survives into the first animation frame within
		// one frame's worth of motion (one line height over 30 frames)
		const maxStep = (grid.lineHeight * fontSize) / 30 + 1e-6;
		const stepTexts = textsOf(firstStep);
		for (const key of rest.keys()) {
			const [x = "0", y = "0", character = ""] = key.split(",");
			const found = stepTexts.some((text) => {
				for (let index = 0; index < text.text.length; index++) {
					if (text.text[index] !== character) {
						continue;
					}
					const cx = text.position.x + index * grid.charWidth * fontSize;
					const cy = text.position.y;
					if (
						Math.abs(cx - Number(x)) <= maxStep &&
						Math.abs(cy - Number(y)) <= maxStep
					) {
						return true;
					}
				}
				return false;
			});
			expect(found, `cell ${key} vanished at the split`).toBe(true);
		}
	});

	it("instance count returns to one Text per line after any edit", async () => {
		const frames = await framesOf(function* () {
			const block = yield* Code.block(options(v1));
			yield* Code.editTo(block, v2, { duration: "200 millis" });
			yield* Code.editTo(block, "const b = 2;", { duration: "200 millis" });
			yield* Scene.tick;
		});
		expect(textsOf(frames.at(-1) ?? unreachable())).toHaveLength(1);
	});

	it("re-running the scene reproduces identical frames", async () => {
		const run = () =>
			framesOf(editScene).then((frames) =>
				frames.map((frame) =>
					Object.fromEntries(cellMapOf(frame, grid, fontSize)),
				),
			);
		expect(await run()).toEqual(await run());
	});

	it("the curried form behaves identically and returns the block", async () => {
		const frames = await framesOf(function* () {
			const block = yield* Code.block(options(v1));
			const returned = yield* Code.editTo(v2, { duration: "200 millis" })(
				block,
			);
			expect(returned).toBe(block);
			yield* Scene.tick;
		});
		expect(textsOf(frames.at(-1) ?? unreachable())).toHaveLength(
			v2.split("\n").length,
		);
	});

	it("overlapping edits die loudly", async () => {
		await expect(
			framesOf(function* () {
				const block = yield* Code.block(options(v1));
				yield* Scene.all([
					Code.editTo(block, v2, { duration: "200 millis" }),
					Code.editTo(block, "x", { duration: "200 millis" }),
				]);
			}),
		).rejects.toThrow(/already in progress/);
	});
});
