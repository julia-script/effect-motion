import { describe, expect, it } from "vitest";
import * as Color from "../src/Color";

describe("Color.bytes (ThorVG boundary)", () => {
	it("scales alpha 0..1 -> 0..255 and rounds channels", () => {
		expect(Color.bytes(Color.rgba(255, 128, 0, 1))).toEqual({
			r: 255,
			g: 128,
			b: 0,
			a: 255,
		});
		expect(Color.bytes(Color.rgba(255, 0, 0, 0.5))).toEqual({
			r: 255,
			g: 0,
			b: 0,
			a: 128,
		});
		expect(Color.bytes(Color.rgba(0, 0, 0, 0))).toEqual({
			r: 0,
			g: 0,
			b: 0,
			a: 0,
		});
	});
	it("hex round-trips through toHex", () => {
		expect(Color.toHex(Color.hex("#224466"))).toBe("#224466");
	});
});
