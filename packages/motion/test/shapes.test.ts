import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Color from "../src/Color";
import * as S from "../src/Entity";
import * as Motion from "../src/Motion";
import * as Scene from "../src/Scene";

const run = (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
) =>
	Effect.runPromise(
		Scene.stream(Scene.make(make as never) as never).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
	);

describe("visible defaults", () => {
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
