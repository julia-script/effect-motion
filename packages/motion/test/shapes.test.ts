import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Color from "../src/Color";
import * as S from "../src/Entity";
import * as Motion from "../src/Motion";
import * as Scene from "../src/Scene";
import { unreachable } from "./support/raise";

const run = (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
) =>
	Effect.runPromise(
		Scene.stream(Scene.make(make as never) as never).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
	);

describe("visible defaults", () => {
	it("Rect radius defaults sharp, preserves finite authored values, and rejects nonfinite values", () => {
		expect(S.Rect.make({}).cornerRadius).toBe(0);
		for (const cornerRadius of [-10, 12, 1000]) {
			expect(
				S.Rect.make({ width: 20, height: 10, cornerRadius }).cornerRadius,
			).toBe(cornerRadius);
		}
		for (const cornerRadius of [
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		]) {
			expect(() => S.Rect.make({ cornerRadius })).toThrow();
		}
	});

	it.each([
		"tween",
		"pipe tween",
		"tweenTo",
		"pipe tweenTo",
	])("%s interpolates radius and preserves exact targets beyond the render clamp", async (form) => {
		const scene = Scene.make(function* () {
			const rect = yield* Scene.instantiate("Rect", {
				width: 40,
				height: 20,
				cornerRadius: 12,
			});
			const from = { cornerRadius: -20 };
			const to = { cornerRadius: 80 };
			switch (form) {
				case "tween":
					yield* Motion.tween(rect, from, to, "100 millis");
					break;
				case "pipe tween":
					yield* rect.pipe(Motion.tween(from, to, "100 millis"));
					break;
				case "tweenTo":
					yield* Motion.tweenTo(rect, to, "100 millis");
					break;
				case "pipe tweenTo":
					yield* rect.pipe(Motion.tweenTo(to, "100 millis"));
					break;
			}
		});
		const frames = await Effect.runPromise(
			Scene.stream(scene).pipe(Stream.runCollect),
		);
		const radii = frames.map((frame) => {
			const data = Object.values(frame.instances).find(
				(entry) => entry.data._tag === "Rect",
			)?.data;
			return data?._tag === "Rect" ? data.cornerRadius : unreachable();
		});
		expect(radii[5]).toBe(80);
		expect(radii[2]).toBeCloseTo(form.endsWith("To") ? 46 : 30);
		expect(radii.at(-1)).toBe(80);
	});
	it("default circle: fill white, opacity 1, no stroke", () => {
		const data = S.Circle.make({});
		expect(data).toMatchObject({
			position: { x: 0, y: 0 },
			fillColor: Color.white,
			opacity: 1,
			radius: 10,
		});
		// no outline unless the scene sets one
		expect("strokeColor" in data).toBe(false);
	});

	it("rect and ellipse draw no outline by default", () => {
		expect("strokeColor" in S.Rect.make({})).toBe(false);
		expect("strokeColor" in S.Ellipse.make({})).toBe(false);
	});

	it("tweening an unset strokeColor dies naming the field", async () => {
		await expect(
			run(function* () {
				const rect = yield* Scene.instantiate("Rect", {});
				yield* Motion.tweenTo(rect, { strokeColor: Color.white }, "100 millis");
			}),
		).rejects.toThrow('"strokeColor" has no current value');
	});

	it("strokeWidth tweens from its default", async () => {
		const frames = await run(function* () {
			const rect = yield* Scene.instantiate("Rect", {
				strokeColor: Color.black,
			});
			yield* Motion.tweenTo(rect, { strokeWidth: 4 }, "100 millis");
		});
		const last = [...frames].at(-1)?.instances ?? {};
		const rect = Object.values(last).find((e) => e.data._tag === "Rect");
		expect(rect?.data._tag === "Rect" && rect.data.strokeWidth).toBe(4);
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
		expect("strokeColor" in data).toBe(false);
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

describe("path and stroke selection data", () => {
	it("defaults to complete solid strokes on every strokable shape", () => {
		for (const data of [
			S.Line.make({}),
			S.Rect.make({}),
			S.Circle.make({}),
			S.Ellipse.make({}),
			S.Path.make({ commands: [{ _tag: "m", x: 0, y: 0 }] }),
		]) {
			expect(data).toMatchObject({
				trimStart: 0,
				trimEnd: 1,
				trimOffset: 0,
				strokeDasharray: [],
				strokeDashoffset: 0,
			});
		}
	});

	it("rejects nonfinite command coordinates, controls, radii, and rotations", () => {
		for (const bad of [
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		]) {
			const commands: ReadonlyArray<S.PathCommand> = [
				{ _tag: "M", x: bad, y: 0 },
				{ _tag: "l", x: 0, y: 0, z: bad },
				{ _tag: "h", x: bad },
				{ _tag: "v", y: bad },
				{ _tag: "C", x1: 0, y1: 0, z1: bad, x2: 0, y2: 0, x: 0, y: 0 },
				{ _tag: "s", x2: 0, y2: bad, x: 0, y: 0 },
				{ _tag: "q", x1: bad, y1: 0, x: 0, y: 0 },
				{
					_tag: "A",
					rx: bad,
					ry: 1,
					xAxisRotation: 0,
					largeArc: false,
					sweep: true,
					x: 1,
					y: 1,
				},
				{
					_tag: "a",
					rx: 1,
					ry: 1,
					xAxisRotation: bad,
					largeArc: false,
					sweep: true,
					x: 1,
					y: 1,
				},
			];
			for (const command of commands)
				expect(() => S.PathCommand.make(command)).toThrow();
		}
	});

	it("rejects nonfinite scalar controls and negative/nonfinite dash lengths", () => {
		for (const value of [
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		]) {
			for (const field of [
				"trimStart",
				"trimEnd",
				"trimOffset",
				"strokeDashoffset",
			] as const) {
				expect(() => S.Line.make({ [field]: value })).toThrow();
			}
		}
		for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => S.Rect.make({ strokeDasharray: [3, value] })).toThrow();
		}
		expect(
			S.Line.make({
				trimStart: -1,
				trimEnd: 2,
				trimOffset: -0.5,
				strokeDasharray: [0, 2, 3],
				strokeDashoffset: -4,
			}),
		).toMatchObject({
			trimStart: -1,
			trimEnd: 2,
			trimOffset: -0.5,
			strokeDasharray: [0, 2, 3],
			strokeDashoffset: -4,
		});
	});

	it("tweens scalar stroke controls to exact final targets", async () => {
		const frames = await run(function* () {
			const path = yield* Scene.instantiate("Path", {
				commands: [
					{ _tag: "m", x: 0, y: 0 },
					{ _tag: "q", x1: 50, y1: 50, x: 100, y: 0 },
				],
			});
			yield* Motion.tweenTo(
				path,
				{ trimStart: 0.2, trimEnd: 0.8, trimOffset: 0.5, strokeDashoffset: 12 },
				"100 millis",
			);
		});
		const last = [...frames].at(-1)?.instances ?? {};
		const path = Object.values(last).find(
			(entry) => entry.data._tag === "Path",
		);
		expect(path?.data).toMatchObject({
			trimStart: 0.2,
			trimEnd: 0.8,
			trimOffset: 0.5,
			strokeDashoffset: 12,
		});
	});
});
