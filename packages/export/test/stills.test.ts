import { describe, expect, it } from "vitest";
import { downscale, tile } from "../src/Stills.js";

const solid = (w: number, h: number, v: number) =>
	new Uint8Array(w * h * 4).fill(v);
const px = (rgba: Uint8Array, width: number, x: number, y: number) => [
	...rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
];

describe("Stills.tile", () => {
	it("lays 3 tiles row-major in a ceil(sqrt(n)) grid with background gaps", () => {
		const grid = tile(
			[solid(2, 1, 10), solid(2, 1, 20), solid(2, 1, 30)],
			2,
			1,
			{
				gap: 1,
				background: { r: 1, g: 2, b: 3, a: 4 },
			},
		);
		expect(grid).toMatchObject({ width: 5, height: 3, columns: 2, rows: 2 });
		expect(px(grid.rgba, 5, 0, 0)).toEqual([10, 10, 10, 10]);
		expect(px(grid.rgba, 5, 2, 0)).toEqual([1, 2, 3, 4]); // gap
		expect(px(grid.rgba, 5, 3, 0)).toEqual([20, 20, 20, 20]);
		expect(px(grid.rgba, 5, 1, 1)).toEqual([1, 2, 3, 4]); // gap row
		expect(px(grid.rgba, 5, 0, 2)).toEqual([30, 30, 30, 30]);
		expect(px(grid.rgba, 5, 3, 2)).toEqual([1, 2, 3, 4]); // empty cell
	});

	it("honors explicit columns", () => {
		const grid = tile([solid(1, 1, 9), solid(1, 1, 9)], 1, 1, {
			columns: 1,
			gap: 0,
		});
		expect(grid).toMatchObject({ width: 1, height: 2, columns: 1, rows: 2 });
	});
});

describe("Stills.downscale", () => {
	it("box-averages to the max width, keeping aspect", () => {
		const src = new Uint8Array([0, 0, 0, 0, 100, 100, 100, 100]);
		const out = downscale(src, 2, 1, 1);
		expect(out.width).toBe(1);
		expect(out.height).toBe(1);
		expect([...out.rgba]).toEqual([50, 50, 50, 50]);
	});

	it("leaves images that already fit untouched", () => {
		const src = solid(2, 2, 7);
		expect(downscale(src, 2, 2, 4).rgba).toBe(src);
	});
});
