import { describe, expect, it } from "vitest";
import * as RichText from "../src/RichText";
import type * as Shapes from "../src/shapes";

const g = (
	cluster: string,
	marks?: Partial<RichText.Marks>,
): RichText.Unit => ({
	kind: "grapheme",
	cluster,
	marks: { strong: false, emphasis: false, ...marks },
});
const BREAK: RichText.Unit = { kind: "break" };

describe("RichText.flatten", () => {
	it("segments a plain string into unmarked graphemes", () => {
		expect(RichText.flatten("hi")).toEqual([g("h"), g("i")]);
	});

	it("keeps grapheme clusters (emoji with modifiers) whole", () => {
		const units = RichText.flatten("a👍🏽b");
		expect(units.map((u) => (u.kind === "grapheme" ? u.cluster : "¶"))).toEqual(
			["a", "👍🏽", "b"],
		);
	});

	it("carries marks across a node split as one stream", () => {
		// "he" + strong("llo")
		const content = {
			type: "root",
			children: [
				{
					type: "paragraph",
					children: [
						{ type: "text", value: "he" },
						{ type: "strong", children: [{ type: "text", value: "llo" }] },
					],
				},
			],
		} satisfies Shapes.TextContent;
		expect(RichText.flatten(content)).toEqual([
			g("h"),
			g("e"),
			g("l", { strong: true }),
			g("l", { strong: true }),
			g("o", { strong: true }),
		]);
	});

	it("accumulates nested marks and inserts one break per paragraph boundary", () => {
		const content = {
			type: "root",
			children: [
				{
					type: "paragraph",
					children: [
						{
							type: "strong",
							children: [
								{ type: "emphasis", children: [{ type: "text", value: "x" }] },
							],
						},
					],
				},
				{ type: "paragraph", children: [{ type: "text", value: "y" }] },
			],
		} satisfies Shapes.TextContent;
		expect(RichText.flatten(content)).toEqual([
			g("x", { strong: true, emphasis: true }),
			BREAK,
			g("y"),
		]);
	});

	it("segments by word when asked", () => {
		const units = RichText.flatten("hi there", "word");
		expect(units.map((u) => (u.kind === "grapheme" ? u.cluster : "¶"))).toEqual(
			["hi", " ", "there"],
		);
	});
});

describe("RichText.rebuild", () => {
	it("rebuilds a single unmarked paragraph as a plain string", () => {
		expect(RichText.rebuild([g("h"), g("i")])).toBe("hi");
	});

	it("rebuilds empty units to an empty string", () => {
		expect(RichText.rebuild([])).toBe("");
	});

	it("coalesces equal-mark runs and nests strong outside emphasis", () => {
		const units = [g("h"), g("i"), g("!", { strong: true, emphasis: true })];
		expect(RichText.rebuild(units)).toEqual({
			type: "root",
			children: [
				{
					type: "paragraph",
					children: [
						{ type: "text", value: "hi" },
						{
							type: "strong",
							children: [
								{ type: "emphasis", children: [{ type: "text", value: "!" }] },
							],
						},
					],
				},
			],
		});
	});

	it("splits paragraphs on break units", () => {
		const rebuilt = RichText.rebuild([g("a"), BREAK, g("b")]);
		expect(rebuilt).toEqual({
			type: "root",
			children: [
				{ type: "paragraph", children: [{ type: "text", value: "a" }] },
				{ type: "paragraph", children: [{ type: "text", value: "b" }] },
			],
		});
	});
});

describe("RichText round-trip", () => {
	it("canonicalises emphasis-outside-strong to strong-outside-emphasis, idempotently", () => {
		const content = {
			type: "root",
			children: [
				{
					type: "paragraph",
					children: [
						{
							type: "emphasis",
							children: [
								{ type: "strong", children: [{ type: "text", value: "x" }] },
							],
						},
					],
				},
			],
		} satisfies Shapes.TextContent;
		const once = RichText.rebuild(RichText.flatten(content));
		// strong now nests outside emphasis
		expect(once).toEqual({
			type: "root",
			children: [
				{
					type: "paragraph",
					children: [
						{
							type: "strong",
							children: [
								{ type: "emphasis", children: [{ type: "text", value: "x" }] },
							],
						},
					],
				},
			],
		});
		// flattening the canonical form yields identical units
		expect(RichText.flatten(once)).toEqual(RichText.flatten(content));
	});
});

describe("RichText.diff", () => {
	const clusters = (units: ReadonlyArray<RichText.Unit>) =>
		units.map((u) => (u.kind === "grapheme" ? u.cluster : "¶"));

	it("keeps common prefix and suffix, editing only the middle", () => {
		const ops = RichText.diff(RichText.flatten("cat"), RichText.flatten("cut"));
		expect(
			ops.map((o) => [o.op, o.unit.kind === "grapheme" ? o.unit.cluster : "¶"]),
		).toEqual([
			["keep", "c"],
			["delete", "a"],
			["insert", "u"],
			["keep", "t"],
		]);
	});

	it("is pure inserts when revealing from empty", () => {
		const ops = RichText.diff([], RichText.flatten("Hi"));
		expect(ops.every((o) => o.op === "insert")).toBe(true);
		expect(clusters(ops.map((o) => o.unit))).toEqual(["H", "i"]);
	});

	it("is pure deletes when clearing to empty", () => {
		const ops = RichText.diff(RichText.flatten("Hi"), []);
		expect(ops.every((o) => o.op === "delete")).toBe(true);
	});

	it("treats a formatting change as a retype (no kept units)", () => {
		const plain = RichText.flatten("hi");
		const bold: RichText.Unit[] = [
			g("h", { strong: true }),
			g("i", { strong: true }),
		];
		const ops = RichText.diff(plain, bold);
		expect(ops.some((o) => o.op === "keep")).toBe(false);
		expect(ops.filter((o) => o.op === "delete")).toHaveLength(2);
		expect(ops.filter((o) => o.op === "insert")).toHaveLength(2);
	});

	it("kept units form the target when applied to deletes and inserts", () => {
		const from = RichText.flatten("cat and dog");
		const to = RichText.flatten("cut and dig");
		const ops = RichText.diff(from, to);
		const applied = ops.filter((o) => o.op !== "delete").map((o) => o.unit);
		expect(applied).toEqual(to);
	});
});
