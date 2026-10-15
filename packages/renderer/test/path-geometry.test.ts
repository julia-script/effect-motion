import type * as Entity from "effect-motion/Entity";
import { describe, expect, it } from "vitest";
import * as PathGeometry from "../src/PathGeometry.js";
import { unreachable } from "./support/raise.js";

const contour = (commands: ReadonlyArray<Entity.PathCommand>) =>
	PathGeometry.flatten(commands)[0] ?? unreachable();
const start: Entity.PathCommand = { _tag: "M", x: 0, y: 0 };

describe("typed path geometry", () => {
	it("resolves relative endpoints, axes, move gaps, and close current points", () => {
		expect(
			PathGeometry.flatten([
				{ _tag: "m", x: 10, y: 20, z: 30 },
				{ _tag: "l", x: 5, y: 6 },
				{ _tag: "h", x: 3 },
				{ _tag: "V", y: 40 },
				{ _tag: "H", x: 7 },
				{ _tag: "v", y: -2 },
				{ _tag: "z" },
				{ _tag: "l", x: 2, y: 4, z: 8 },
				{ _tag: "M", x: -1, y: -2 },
				{ _tag: "L", x: 0, y: 0 },
			]),
		).toEqual([
			{
				closed: true,
				points: [
					{ x: 10, y: 20, z: 30 },
					{ x: 15, y: 26, z: 30 },
					{ x: 18, y: 26, z: 30 },
					{ x: 18, y: 40, z: 30 },
					{ x: 7, y: 40, z: 30 },
					{ x: 7, y: 38, z: 30 },
				],
			},
			{
				closed: false,
				points: [
					{ x: 10, y: 20, z: 30 },
					{ x: 12, y: 24, z: 38 },
				],
			},
			{
				closed: false,
				points: [
					{ x: -1, y: -2, z: 0 },
					{ x: 0, y: 0, z: 0 },
				],
			},
		]);
	});

	it("samples quadratic depth and cubic inflections instead of flattening their chord", () => {
		const quadratic = contour([
			start,
			{ _tag: "Q", x1: 40, y1: 80, z1: 24, x: 80, y: 0 },
		]);
		expect(quadratic.points).toContainEqual({ x: 40, y: 40, z: 12 });
		expect(quadratic.points.at(-1)).toEqual({ x: 80, y: 0, z: 0 });
		const cubic = contour([
			start,
			{ _tag: "C", x1: 0, y1: 100, x2: 100, y2: -100, x: 100, y: 0 },
		]);
		expect(cubic.points).toContainEqual({ x: 50, y: 0, z: 0 });
		expect(Math.max(...cubic.points.map((p) => p.y))).toBeGreaterThan(28);
		expect(Math.min(...cubic.points.map((p) => p.y))).toBeLessThan(-28);
		expect(cubic.points.at(-1)).toEqual({ x: 100, y: 0, z: 0 });
	});

	it("retains collinear overshoot and closed-loop curvature", () => {
		const overshoot = contour([
			start,
			{ _tag: "C", x1: 100, y1: 0, x2: 100, y2: 0, x: 1, y: 0 },
		]);
		expect(Math.max(...overshoot.points.map((p) => p.x))).toBeGreaterThan(75);
		const loop = contour([
			start,
			{ _tag: "C", x1: 100, y1: 100, x2: -100, y2: 100, x: 0, y: 0 },
		]);
		expect(loop.points).toContainEqual({ x: 0, y: 75, z: 0 });
	});

	it("reflects compatible smooth controls in 3D and resets after lines", () => {
		const q = contour([
			{ _tag: "M", x: 10, y: 20, z: 30 },
			{ _tag: "q", x1: 10, y1: 40, z1: 10, x: 20, y: 0, z: 20 },
			{ _tag: "t", x: 20, y: 0, z: 20 },
			{ _tag: "L", x: 50, y: 20, z: 70 },
			{ _tag: "T", x: 70, y: 20, z: 90 },
		]);
		expect(q.points).toContainEqual({ x: 20, y: 40, z: 40 });
		expect(q.points).toContainEqual({ x: 40, y: 0, z: 60 });
		expect(q.points.at(-1)).toEqual({ x: 70, y: 20, z: 90 });
		const c = contour([
			start,
			{
				_tag: "c",
				x1: 0,
				y1: 40,
				z1: 0,
				x2: 40,
				y2: 40,
				z2: 20,
				x: 40,
				y: 0,
				z: 40,
			},
			{ _tag: "s", x2: 40, y2: -40, z2: 20, x: 40, y: 0, z: 40 },
		]);
		expect(c.points).toContainEqual({ x: 60, y: -30, z: 60 });
		const reset = contour([
			start,
			{ _tag: "L", x: 10, y: 10 },
			{ _tag: "S", x2: 10, y2: 10, x: 20, y: 20 },
		]);
		expect(reset.points).toEqual([
			{ x: 0, y: 0, z: 0 },
			{ x: 10, y: 10, z: 0 },
			{ x: 20, y: 20, z: 0 },
		]);
	});

	it("follows positive arc sweep in y-up space and interpolates depth linearly", () => {
		const arc = contour([
			{ _tag: "M", x: 10, y: 0, z: 4 },
			{
				_tag: "A",
				rx: 10,
				ry: 10,
				xAxisRotation: 0,
				largeArc: false,
				sweep: true,
				x: 0,
				y: 10,
				z: 12,
			},
		]);
		const middle =
			arc.points[Math.floor(arc.points.length / 2)] ?? unreachable();
		expect(middle.x).toBeCloseTo(Math.SQRT1_2 * 10);
		expect(middle.y).toBeCloseTo(Math.SQRT1_2 * 10);
		expect(middle.z).toBe(8);
		expect(arc.points.at(-1)).toEqual({ x: 0, y: 10, z: 12 });
		const major = contour([
			{ _tag: "M", x: 10, y: 0 },
			{
				_tag: "A",
				rx: 10,
				ry: 10,
				xAxisRotation: 0,
				largeArc: true,
				sweep: false,
				x: 0,
				y: 10,
			},
		]);
		expect(Math.min(...major.points.map((p) => p.y))).toBeLessThan(-9.9);
		expect(Math.min(...major.points.map((p) => p.x))).toBeLessThan(-9.9);
	});

	it("rotates ellipse axes in degrees and resolves relative arc endpoints", () => {
		const points = contour([
			{ _tag: "M", x: 0, y: 20 },
			{
				_tag: "a",
				rx: 20,
				ry: 10,
				xAxisRotation: 90,
				largeArc: false,
				sweep: true,
				x: -10,
				y: -20,
			},
		]).points;
		const middle = points[Math.floor(points.length / 2)] ?? unreachable();
		expect(middle.x).toBeCloseTo(-10 * Math.SQRT1_2);
		expect(middle.y).toBeCloseTo(20 * Math.SQRT1_2);
		expect(points.at(-1)).toEqual({ x: -10, y: 0, z: 0 });
	});

	it("normalizes arc radii, expands undersized arcs, and handles degenerate arcs", () => {
		const command: Entity.PathCommand = {
			_tag: "A",
			rx: 2,
			ry: 2,
			xAxisRotation: 0,
			largeArc: false,
			sweep: true,
			x: 20,
			y: 0,
		};
		const positive = contour([start, command]);
		expect(contour([start, { ...command, rx: -2, ry: -2 }])).toEqual(positive);
		const bottom =
			positive.points[Math.floor(positive.points.length / 2)] ?? unreachable();
		expect(bottom.x).toBeCloseTo(10);
		expect(bottom.y).toBeCloseTo(-10);
		expect(contour([start, { ...command, rx: 0 }]).points).toEqual([
			{ x: 0, y: 0, z: 0 },
			{ x: 20, y: 0, z: 0 },
		]);
		expect(PathGeometry.flatten([start, { ...command, x: 0 }])).toEqual([]);
	});

	it("does not paint move-only contours or repeated closes, but preserves explicit zero-length strokes", () => {
		expect(
			PathGeometry.flatten([
				start,
				{ _tag: "Z" },
				{ _tag: "z" },
				{ _tag: "m", x: 1, y: 1 },
			]),
		).toEqual([]);
		expect(contour([start, { _tag: "l", x: 0, y: 0 }]).points).toEqual([
			{ x: 0, y: 0, z: 0 },
			{ x: 0, y: 0, z: 0 },
		]);
	});

	it("omits coincident XY arcs while starting subsequent lines at their endpoint depth", () => {
		expect(
			PathGeometry.flatten([
				start,
				{ _tag: "L", x: 10, y: 0 },
				{
					_tag: "A",
					rx: 5,
					ry: 5,
					xAxisRotation: 0,
					largeArc: false,
					sweep: true,
					x: 10,
					y: 0,
					z: 20,
				},
				{ _tag: "L", x: 20, y: 0, z: 30 },
				{ _tag: "Z" },
			]),
		).toEqual([
			{
				closed: false,
				points: [
					{ x: 0, y: 0, z: 0 },
					{ x: 10, y: 0, z: 0 },
				],
			},
			{
				closed: false,
				points: [
					{ x: 10, y: 0, z: 20 },
					{ x: 20, y: 0, z: 30 },
					{ x: 0, y: 0, z: 0 },
				],
			},
		]);
	});

	it("fails loudly when finite inputs exceed representable geometry instead of emitting NaN", () => {
		expect(() =>
			PathGeometry.flatten([
				start,
				{
					_tag: "A",
					rx: Number.MIN_VALUE,
					ry: 1,
					xAxisRotation: 0,
					largeArc: false,
					sweep: true,
					x: 10,
					y: 0,
				},
			]),
		).toThrow("Path arc geometry");
		expect(() =>
			PathGeometry.flatten([
				{ _tag: "M", x: 1e308, y: 0 },
				{ _tag: "l", x: 1e308, y: 0 },
			]),
		).toThrow("Path geometry");
	});

	it("is deterministic, does not mutate commands, and bounds pathological subdivisions", () => {
		const commands: ReadonlyArray<Entity.PathCommand> = Object.freeze([
			Object.freeze(start),
			Object.freeze({ _tag: "Q", x1: 1e15, y1: 1e15, x: 1, y: 0 }),
		]);
		const first = PathGeometry.flatten(commands);
		expect(PathGeometry.flatten(commands)).toEqual(first);
		const points = (first[0] ?? unreachable()).points;
		expect(points.length).toBeLessThanOrEqual(65537);
		expect(points.at(-1)).toEqual({ x: 1, y: 0, z: 0 });
		expect(
			points.every(
				(p) =>
					Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
			),
		).toBe(true);
	});
});
