import { describe, expect, it } from "vitest";
import * as Timing from "../src/Timing";

const periodic = new Set(["sin", "cos"]);

describe("endpoints", () => {
	for (const [name, fn] of Object.entries(Timing.timingFunctions)) {
		if (periodic.has(name)) {
			continue;
		}
		it(`${name}: f(0) = 0 and f(1) = 1`, () => {
			expect(fn(0)).toBeCloseTo(0, 10);
			expect(fn(1)).toBeCloseTo(1, 10);
		});
	}

	it("sin/cos are periodic: end where they start", () => {
		expect(Timing.sin(0)).toBeCloseTo(0, 10);
		expect(Timing.sin(1)).toBeCloseTo(0, 10);
		expect(Timing.sin(0.5)).toBeCloseTo(1, 10);
		expect(Timing.cos(0)).toBeCloseTo(1, 10);
		expect(Timing.cos(1)).toBeCloseTo(1, 10);
		expect(Timing.cos(0.5)).toBeCloseTo(0, 10);
	});
});

describe("known values", () => {
	it("quad family midpoints", () => {
		expect(Timing.easeInQuad(0.5)).toBeCloseTo(0.25, 10);
		expect(Timing.easeOutQuad(0.5)).toBeCloseTo(0.75, 10);
		expect(Timing.easeInOutQuad(0.5)).toBeCloseTo(0.5, 10);
		expect(Timing.easeInOutQuad(0.25)).toBeCloseTo(0.125, 10);
	});

	it("cubic ease-in midpoint", () => {
		expect(Timing.easeInCubic(0.5)).toBeCloseTo(0.125, 10);
	});

	it("easeOutBack overshoots above 1 mid-curve", () => {
		const values = [0.6, 0.7, 0.8, 0.9].map(Timing.easeOutBack);
		expect(Math.max(...values)).toBeGreaterThan(1);
	});

	it("easeInBack dips below 0 mid-curve", () => {
		const values = [0.1, 0.2, 0.3, 0.4].map(Timing.easeInBack);
		expect(Math.min(...values)).toBeLessThan(0);
	});
});

describe("factories", () => {
	it("shape parameters change the curve but not the endpoints", () => {
		const custom = Timing.createEaseInBack(3);
		expect(custom(0.5)).not.toBeCloseTo(Timing.easeInBack(0.5), 5);
		expect(custom(0)).toBeCloseTo(0, 10);
		expect(custom(1)).toBeCloseTo(1, 10);
	});

	it("bounce parameters change the curve but not the endpoints", () => {
		const custom = Timing.createEaseOutBounce(5, 2.75);
		expect(custom(0.2)).not.toBeCloseTo(Timing.easeOutBounce(0.2), 5);
		expect(custom(1)).toBeCloseTo(1, 10);
	});
});

describe("resolve", () => {
	it("resolves built-ins by name", () => {
		expect(Timing.resolve("easeInQuad")).toBe(Timing.easeInQuad);
		expect(Timing.resolve("linear")).toBe(Timing.linear);
	});

	it("passes custom functions through", () => {
		const custom: Timing.TimingFunction = (t) => t * t;
		expect(Timing.resolve(custom)).toBe(custom);
	});

	it("throws on unknown names", () => {
		expect(() =>
			Timing.resolve("easeInOutTypo" as Timing.TimingFunctionName),
		).toThrow(/unknown timing function/);
	});
});
