import * as Timing from "effect-motion/Timing";
import { describe, expect, it } from "vitest";
import * as Easings from "../src/Easings";
import { unreachable } from "./support/raise";

describe("catalog", () => {
	it("covers every built-in easing, and nothing else", () => {
		expect([...Easings.easings].map((easing) => easing.name)).toEqual(
			Object.keys(Timing.timingFunctions),
		);
	});

	it("recognises names and rejects everything else", () => {
		expect(Easings.isEasingName("easeOutBack")).toBe(true);
		expect(Easings.isEasingName("easeOutBackwards")).toBe(false);
		expect(Easings.find("nope")).toBeUndefined();
	});

	// the flags are what the hover promises about a curve; check them against
	// the curve itself rather than trusting the prose
	it("flags exactly the curves that leave [0, 1]", () => {
		for (const easing of Easings.easings) {
			const samples = Easings.sample(easing.name, 200);
			const leaves = samples.some((value) => value < -1e-9 || value > 1 + 1e-9);
			expect(
				{ name: easing.name, leaves },
				`${easing.name} overshoot flag`,
			).toEqual({ name: easing.name, leaves: easing.overshoots });
		}
	});

	it("flags exactly the curves that return to their start", () => {
		for (const easing of Easings.easings) {
			const samples = Easings.sample(easing.name, 200);
			const first = samples[0] ?? unreachable();
			const last = samples.at(-1) ?? unreachable();
			const returns = Math.abs(last - first) < 1e-9;
			expect({ name: easing.name, returns }, `${easing.name} periodic`).toEqual(
				{ name: easing.name, returns: easing.periodic },
			);
		}
	});

	// the library's endpoint guarantee, to within double precision — the
	// engine's own final-frame snap is what makes the landing exact
	it("non-periodic curves reach the target at t = 1", () => {
		for (const easing of Easings.easings.filter((item) => !item.periodic)) {
			expect(Easings.sample(easing.name, 32).at(-1), easing.name).toBeCloseTo(
				1,
				12,
			);
		}
	});
});

describe("sampling", () => {
	it("returns steps + 1 samples, endpoints included", () => {
		expect(Easings.sample("linear", 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
	});

	it("uses the real Timing functions, not a copy", () => {
		const samples = Easings.sample("easeOutCubic", 10);
		for (const [index, value] of samples.entries())
			expect(value).toBe(Timing.easeOutCubic(index / 10));
	});
});

describe("plotting", () => {
	it("emits a single well-formed svg element", () => {
		const svg = Easings.curveSvg("easeInOutCubic");
		expect(svg.startsWith("<svg ")).toBe(true);
		expect(svg.endsWith("</svg>")).toBe(true);
		expect(svg.match(/<svg /g)).toHaveLength(1);
		expect(svg).toContain('width="132"');
	});

	it("fits overshoot inside the viewbox instead of clipping it", () => {
		const svg = Easings.curveSvg("easeOutBack", { width: 100, height: 100 });
		const ys = [...svg.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((match) =>
			Number(match[2]),
		);
		expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...ys)).toBeLessThanOrEqual(100);
	});

	it("honours the theme it is given", () => {
		expect(Easings.curveSvg("linear", { theme: Easings.lightTheme })).toContain(
			Easings.lightTheme.stroke,
		);
	});

	// markdown ends an image url at the first space, and svg attributes are
	// full of them — base64 is what keeps the payload from breaking
	it("encodes a data uri that survives a markdown image", () => {
		const svg = Easings.curveSvg("easeOutBack");
		const uri = Easings.toDataUri(svg);
		expect(uri.startsWith("data:image/svg+xml;base64,")).toBe(true);
		expect(uri).not.toMatch(/[\s"<>#()]/);
		expect(atob(uri.slice("data:image/svg+xml;base64,".length))).toBe(svg);
	});
});
