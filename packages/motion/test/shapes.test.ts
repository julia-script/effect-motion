import { describe, expect, it } from "vitest";
import * as Color from "../src/Color";
import * as Shapes from "../src/Shapes";

describe("visible defaults", () => {
	it("default circle: fill white, opacity 1, no stroke", () => {
		const data = Shapes.Circle.data.make({});
		expect(data).toMatchObject({
			x: 0,
			y: 0,
			fill: Color.white,
			opacity: 1,
			radius: 10,
		});
		expect("stroke" in data).toBe(false);
		expect("strokeWidth" in data).toBe(false);
	});

	it("path: commands required, fill white, per-point z optional", () => {
		const data = Shapes.Path.data.make({
			commands: [
				{ _tag: "M", x: 0, y: 0 },
				{ _tag: "L", x: 10, y: 10, z: -50 },
				{ _tag: "Z" },
			],
		});
		expect(data).toMatchObject({
			x: 0,
			y: 0,
			fill: Color.white,
			opacity: 1,
		});
		expect(data.commands).toHaveLength(3);
		expect("stroke" in data).toBe(false);
		// the d string is gone — commands is the only geometry input
		expect("d" in data).toBe(false);
	});

	it("path: first command must be M", () => {
		expect(() =>
			Shapes.Path.data.make({
				commands: [{ _tag: "L", x: 10, y: 10 }],
			}),
		).toThrow();
		expect(() =>
			Shapes.Path.data.make({ commands: [{ _tag: "Z" }] }),
		).toThrow();
	});

	it("default line: stroke white, strokeWidth 1, no fill", () => {
		const data = Shapes.Line.data.make({ x2: 50, y2: 20 });
		expect(data).toMatchObject({
			x: 0,
			y: 0,
			x2: 50,
			y2: 20,
			stroke: Color.white,
			strokeWidth: 1,
			opacity: 1,
		});
		expect("fill" in data).toBe(false);
	});
});
