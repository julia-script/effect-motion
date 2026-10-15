import { describe, expect, it } from "vitest";
import * as RectGeometry from "../src/RectGeometry.js";
import { unreachable } from "./support/raise.js";

describe("rounded rectangle contours", () => {
	it("preserves sharp corner order, signed extents and collapsed dimensions", () => {
		for (const r of [0, -10]) {
			expect(RectGeometry.contour(100, 40, r)).toEqual([
				[-50, 20],
				[50, 20],
				[50, -20],
				[-50, -20],
			]);
			expect(RectGeometry.contour(-100, 40, r)).toEqual([
				[50, 20],
				[-50, 20],
				[-50, -20],
				[50, -20],
			]);
		}
		expect(RectGeometry.contour(0, 40, 20).map(([x]) => Math.abs(x))).toEqual([
			0, 0, 0, 0,
		]);
		expect(RectGeometry.contour(40, 0, 20).map(([, y]) => Math.abs(y))).toEqual(
			[0, 0, 0, 0],
		);
	});

	it.each([
		[100, 40, 10],
		[100, 40, 1000],
		[40, 40, 1000],
		[40, 100, 1000],
	])("bounds and tangencies of %s x %s at radius %s follow a rounded rectangle", (width, height, requested) => {
		const r = Math.min(requested, Math.min(width, height) / 2);
		const points = RectGeometry.contour(width, height, requested);
		expect(points.length).toBeLessThanOrEqual(68);
		const x = width / 2,
			y = height / 2;
		for (const tangent of [
			[-x + r, y],
			[x - r, y],
			[x, y - r],
			[x, -y + r],
			[x - r, -y],
			[-x + r, -y],
			[-x, -y + r],
			[-x, y - r],
		]) {
			expect(points).toContainEqual(tangent);
		}
		for (const [index, [px, py]] of points.entries()) {
			expect(Math.abs(px)).toBeLessThanOrEqual(x);
			expect(Math.abs(py)).toBeLessThanOrEqual(y);
			// The distance to the nearest point of the inset rectangle is r.
			expect(
				Math.hypot(
					Math.max(0, Math.abs(px) - (x - r)),
					Math.max(0, Math.abs(py) - (y - r)),
				),
			).toBeCloseTo(r, 10);
			expect(points[(index + 1) % points.length] ?? unreachable()).not.toEqual([
				px,
				py,
			]);
		}
		expect(RectGeometry.contour(width, height, requested)).toEqual(points);
		for (const sx of [-1, 1])
			for (const sy of [-1, 1]) {
				const reflected = RectGeometry.contour(
					width * sx,
					height * sy,
					requested,
				);
				reflected.forEach(([px, py], index) => {
					const original = points[index] ?? unreachable();
					expect(px).toBeCloseTo(original[0] * sx, 10);
					expect(py).toBeCloseTo(original[1] * sy, 10);
				});
			}
	});
});
