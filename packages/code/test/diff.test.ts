import { parser } from "@lezer/javascript";
import * as Color from "effect-motion/Color";
import { describe, expect, it } from "vitest";
import * as Diff from "../src/Diff.js";
import * as Highlight from "../src/Highlight.js";

const ink = Color.rgba(220, 220, 230);
const highlighted = (code: string) =>
	Highlight.highlight(code, parser, Highlight.defaultTheme);

const plain = <A>(value: A): unknown => JSON.parse(JSON.stringify(value));

describe("Diff.plan", () => {
	it("is deterministic: same inputs, deeply equal plans", () => {
		const before = highlighted("const a = 1;\nconst b = 2;");
		const after = highlighted("const a = 1;\nconst c = 3;");
		expect(plain(Diff.plan(before, after, ink))).toEqual(
			plain(Diff.plan(before, after, ink)),
		);
	});

	it("inserting a line keeps other lines whole (vertical slides only)", () => {
		const before = highlighted("const a = 1;\nconst b = 2;");
		const after = highlighted("const a = 1;\nconst mid = 0;\nconst b = 2;");
		const plan = Diff.plan(before, after, ink);
		expect(plan.wholeLines).toEqual([
			{ from: 0, to: 0 },
			{ from: 1, to: 2 },
		]);
		expect(plan.splitLines).toEqual([]);
		// every fragment is an insertion on the new middle line
		for (const fragment of plan.fragments) {
			expect(fragment.kind).toBe("inserted");
			if (fragment.kind === "inserted") {
				expect(fragment.to.line).toBe(1);
			}
		}
		expect(plan.fragments.length).toBeGreaterThan(0);
	});

	it("an intra-line rename keeps the unchanged tokens and swaps the name", () => {
		const before = highlighted("const alpha = 1;");
		const after = highlighted("const beta = 1;");
		const plan = Diff.plan(before, after, ink);
		expect(plan.splitLines).toEqual([0]);
		const kinds = new Map<string, string>();
		for (const fragment of plan.fragments) {
			kinds.set(fragment.text, fragment.kind);
		}
		expect(kinds.get("const")).toBe("kept");
		expect(kinds.get("1")).toBe("kept");
		expect(kinds.get(";")).toBe("kept");
		expect(kinds.get("alpha")).toBe("removed");
		expect(kinds.get("beta")).toBe("inserted");
	});

	it("content moving against token order migrates instead of fading", () => {
		// "(x + y)" moves UP a line while "();" moves down — the migration
		// pass is what keeps the out-of-order remainder sliding
		const before = highlighted("foo();\nbar(x + y);");
		const after = highlighted("foo(x + y);\nbar();");
		const plan = Diff.plan(before, after, ink);
		// nothing in this edit fades — every token slides
		for (const fragment of plan.fragments) {
			expect(fragment.kind).toBe("kept");
		}
		const moved = plan.fragments.filter(
			(fragment) =>
				fragment.kind === "kept" && fragment.from.line !== fragment.to.line,
		);
		// "(", "x", "+", "y", ");" ride up; "();" migrates down
		expect(moved.length).toBe(6);
	});

	it("pathological repeated tokens stay deterministic and total", () => {
		const before = highlighted("}\n}\n}\n}");
		const after = highlighted("}\n}");
		const first = Diff.plan(before, after, ink);
		expect(plain(first)).toEqual(plain(Diff.plan(before, after, ink)));
		// totality: two lines kept whole, the other two split away
		expect(first.wholeLines.length).toBe(2);
		expect(first.splitLines.length).toBe(2);
	});
});
