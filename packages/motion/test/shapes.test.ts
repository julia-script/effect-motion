import { describe, expect, it } from "vitest";
import * as Color from "../src/Color";
import * as S from "../src/Entity";

describe("visible defaults", () => {
	it("default circle: fill white, opacity 1, no stroke", () => {
		const data = S.Circle.make({});
		expect(data).toMatchObject({
			position: { x: 0, y: 0 },
			fillColor: Color.white,
			opacity: 1,
			radius: 10,
		});
		// stroke is defaulted now (the union gives every strokable shape a
		// strokeColor/strokeWidth), so presence is the expectation
		expect("strokeColor" in data).toBe(true);
		expect(data.strokeWidth).toBe(1);
	});

	it("path: commands required, fill white, per-point z optional", () => {
		const data = S.Path.make({
			commands: [
				{ _tag: "M", x: 0, y: 0 },
				{ _tag: "L", x: 10, y: 10, z: -50 },
				{ _tag: "Z" },
			],
		});
		expect(data).toMatchObject({
			position: { x: 0, y: 0 },
			fillColor: Color.white,
			opacity: 1,
		});
		expect(data.commands).toHaveLength(3);
		expect("stroke" in data).toBe(false);
		// the d string is gone — commands is the only geometry input
		expect("d" in data).toBe(false);
	});

	it("path: first command must be M", () => {
		expect(() =>
			S.Path.make({
				commands: [{ _tag: "L", x: 10, y: 10 }],
			}),
		).toThrow();
		expect(() => S.Path.make({ commands: [{ _tag: "Z" }] })).toThrow();
	});

	it("default line: stroke white, strokeWidth 1, no fill", () => {
		const data = S.Line.make({ end: S.vec3({ x: 50, y: 20 }) });
		expect(data).toMatchObject({
			position: { x: 0, y: 0 },
			end: { x: 50, y: 20 },
			strokeColor: Color.black,
			strokeWidth: 1,
			opacity: 1,
		});
		// a line is unfillable: no fillColor field at all
		expect("fillColor" in data).toBe(false);
	});
});
