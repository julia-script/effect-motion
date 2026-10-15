import { describe, expect, it } from "vitest";
import type { Subpath } from "../src/PathGeometry.js";
import * as StrokeGeometry from "../src/StrokeGeometry.js";

const point = (x: number, y = 0, z = 0) => ({ x, y, z });
const line: Subpath = { points: [point(0), point(12)], closed: false };
const square: Subpath = {
	points: [point(0), point(10), point(10, 10), point(0, 10)],
	closed: true,
};
const style: StrokeGeometry.Style = {
	trimStart: 0,
	trimEnd: 1,
	trimOffset: 0,
	strokeDasharray: [],
	strokeDashoffset: 0,
};
const apply = (
	paths: ReadonlyArray<Subpath>,
	controls: Partial<StrokeGeometry.Style> = {},
) => StrokeGeometry.apply(paths, { ...style, ...controls });
const fragments = (...segments: Array<ReadonlyArray<number>>): Array<Subpath> =>
	segments.map((segment) => ({
		points: segment.map((x) => point(x)),
		closed: false,
	}));

describe("local stroke intervals", () => {
	it("keeps full contours closed at every offset and clamps trim endpoints", () => {
		for (const trimOffset of [-1.75, 0, 0.25, 18])
			expect(
				apply([square], { trimStart: -1, trimEnd: 2, trimOffset }),
			).toEqual([square]);
	});

	it("makes reversed or empty trim paint nothing, including zero-length strokes", () => {
		const dot: Subpath = { points: [point(3)], closed: false };
		for (const controls of [
			{ trimStart: 0, trimEnd: 0 },
			{ trimStart: 0.8, trimEnd: 0.2 },
			{ trimStart: 2, trimEnd: 3 },
		])
			expect(apply([line, dot], controls)).toEqual([]);
		expect(apply([dot])).toEqual([dot]);
	});

	it("measures all contours globally without counting move gaps", () => {
		const distant: Subpath = {
			points: [point(100), point(108)],
			closed: false,
		};
		expect(apply([line, distant], { trimStart: 0.5, trimEnd: 0.8 })).toEqual(
			fragments([10, 12], [100, 104]),
		);
	});

	it("cuts by 3D length and interpolates depth, retaining intermediate vertices", () => {
		const spatial: Subpath = {
			points: [point(0), point(3, 0, 4), point(3, 5, 4)],
			closed: false,
		};
		expect(apply([spatial], { trimStart: 0.25, trimEnd: 0.75 })).toEqual([
			{
				points: [point(1.5, 0, 2), point(3, 0, 4), point(3, 2.5, 4)],
				closed: false,
			},
		]);
	});

	it("includes the closing segment in length and reconnects a wrapped closed seam", () => {
		expect(
			apply([square], { trimStart: 0, trimEnd: 0.5, trimOffset: 0.75 }),
		).toEqual([{ points: [point(0, 10), point(0), point(10)], closed: false }]);
		expect(apply([square], { trimStart: 0.75, trimEnd: 1 })).toEqual([
			{ points: [point(0, 10), point(0)], closed: false },
		]);
	});

	it("wraps negative trim offsets without connecting the ends of an open contour", () => {
		expect(apply([line], { trimEnd: 0.5, trimOffset: -0.25 })).toEqual(
			fragments([0, 3], [9, 12]),
		);
	});

	it("repeats odd dash arrays with alternating painted and unpainted entries", () => {
		expect(apply([line], { strokeDasharray: [3] })).toEqual(
			fragments([0, 3], [6, 9]),
		);
		expect(apply([line], { strokeDasharray: [2, 1, 3] })).toEqual(
			fragments([0, 2], [3, 6], [8, 9]),
		);
	});

	it("advances positive dash offsets and normalizes negative offsets", () => {
		expect(
			apply([line], { strokeDasharray: [3, 2], strokeDashoffset: 1 }),
		).toEqual(fragments([0, 2], [4, 7], [9, 12]));
		expect(
			apply([line], { strokeDasharray: [3, 2], strokeDashoffset: -1 }),
		).toEqual(fragments([1, 4], [6, 9], [11, 12]));
	});

	it("keeps dash phase anchored before trim and restarts at each original subpath", () => {
		expect(apply([line], { strokeDasharray: [3, 2], trimStart: 0.5 })).toEqual(
			fragments([6, 8], [10, 12]),
		);
		const distant: Subpath = {
			points: [point(100), point(107)],
			closed: false,
		};
		expect(apply([line, distant], { strokeDasharray: [3, 2] })).toEqual(
			fragments([0, 3], [5, 8], [10, 12], [100, 103], [105, 107]),
		);
	});

	it("preserves round dots for zero painted entries and treats all-zero patterns as solid", () => {
		expect(apply([line], { strokeDasharray: [0, 3] })).toEqual(
			fragments([0], [3], [6], [9], [12]),
		);
		expect(apply([line], { strokeDasharray: [0, 0, 0] })).toEqual([line]);
		expect(apply([square], { strokeDasharray: [2, 0] })).toEqual([square]);
		const dot: Subpath = { points: [point(3)], closed: false };
		expect(apply([dot], { strokeDasharray: [2, 2] })).toEqual([dot]);
		expect(
			apply([dot], { strokeDasharray: [2, 2], strokeDashoffset: 3 }),
		).toEqual([]);
	});

	it("reconnects dashed coverage over a closed seam without bridging its gap", () => {
		expect(apply([square], { strokeDasharray: [15, 10] })).toEqual([
			{
				points: [point(5, 10), point(0, 10), point(0), point(10), point(10, 5)],
				closed: false,
			},
		]);
	});

	it("keeps dots at trim boundaries but does not manufacture dots from positive dashes", () => {
		expect(
			apply([line], { strokeDasharray: [3, 3], trimStart: 0.25, trimEnd: 0.5 }),
		).toEqual([]);
		expect(
			apply([line], { strokeDasharray: [0, 3], trimStart: 0.25, trimEnd: 0.5 }),
		).toEqual(fragments([3], [6]));
	});

	it("fails loudly for pathological dash expansion instead of looping or truncating", () => {
		expect(() => apply([line], { strokeDasharray: [1e-9, 1e-9] })).toThrow(
			/StrokeGeometry.*work limit/,
		);
	});
});
