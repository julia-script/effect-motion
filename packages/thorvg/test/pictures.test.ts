import { Effect, Ref, type Scope } from "effect";
import { describe, expect, it } from "vitest";
import * as Canvas from "../src/Canvas";
import type { ThorvgWasm } from "../src/Engine";
import * as EngineNode from "../src/EngineNode";
import * as Picture from "../src/Picture";
import { encodePng } from "../src/png";

/** Pictures (design D5 / thorvg-images spec). */

const run = <A, E>(effect: Effect.Effect<A, E, ThorvgWasm | Scope.Scope>) =>
	Effect.runPromise(
		effect.pipe(Effect.scoped, Effect.provide(EngineNode.layer("sw", {}))),
	);

// an 8×8 solid green PNG produced by the package's own encoder
const greenPng = (() => {
	const rgba = new Uint8Array(8 * 8 * 4);
	for (let i = 0; i < rgba.length; i += 4) {
		rgba[i + 1] = 255;
		rgba[i + 3] = 255;
	}
	return encodePng(rgba, 8, 8);
})();

const svgBytes = new TextEncoder().encode(
	'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#f00"/></svg>',
);

/** draw `picture` onto a canvas and return the framebuffer */
const drawPicture = (width: number, height: number) =>
	Effect.gen(function* () {
		const canvas = yield* Canvas.make(width, height);
		const picture = yield* Picture.make();
		return { canvas, picture };
	});

describe("pictures", () => {
	it("PNG bytes decode and render", async () => {
		const fb = await run(
			Effect.gen(function* () {
				const { canvas, picture } = yield* drawPicture(8, 8);
				yield* Picture.load(picture, greenPng, { type: "png" });
				yield* Canvas.add(canvas, picture);
				yield* Canvas.update(canvas);
				yield* Canvas.draw(canvas);
				yield* Canvas.sync(canvas);
				return new Uint8Array(yield* Canvas.render(canvas));
			}),
		);
		// center pixel is the decoded green
		const o = (4 * 8 + 4) * 4;
		expect(fb[o + 1]).toBeGreaterThan(200); // G
		expect(fb[o]).toBeLessThan(50); // R
	}, 30000);

	it("SVG data loads and reports its natural size", async () => {
		const size = await run(
			Effect.gen(function* () {
				const picture = yield* Picture.make();
				yield* Picture.load(picture, svgBytes, { type: "svg" });
				return yield* Picture.getSize(picture);
			}),
		);
		expect(size.width).toBeCloseTo(20, 1);
		expect(size.height).toBeCloseTo(10, 1);
	}, 30000);

	it("setSize scales the rendered output", async () => {
		const fb = await run(
			Effect.gen(function* () {
				const { canvas, picture } = yield* drawPicture(16, 16);
				yield* Picture.load(picture, greenPng, { type: "png" });
				yield* Picture.setSize(picture, 16, 16);
				yield* Canvas.add(canvas, picture);
				yield* Canvas.update(canvas);
				yield* Canvas.draw(canvas);
				yield* Canvas.sync(canvas);
				return new Uint8Array(yield* Canvas.render(canvas));
			}),
		);
		// with the 8×8 image scaled to 16×16, pixel (12,12) is still green
		const o = (12 * 16 + 12) * 4;
		expect(fb[o + 1]).toBeGreaterThan(200);
	}, 30000);

	it("raw RGBA loads and renders those pixels", async () => {
		const fb = await run(
			Effect.gen(function* () {
				const rgba = new Uint8Array(4 * 4 * 4);
				for (let i = 0; i < rgba.length; i += 4) {
					rgba[i] = 255; // straight red
					rgba[i + 3] = 255;
				}
				const { canvas, picture } = yield* drawPicture(4, 4);
				yield* Picture.loadRaw(picture, rgba, { width: 4, height: 4 });
				yield* Canvas.add(canvas, picture);
				yield* Canvas.update(canvas);
				yield* Canvas.draw(canvas);
				yield* Canvas.sync(canvas);
				return new Uint8Array(yield* Canvas.render(canvas));
			}),
		);
		const o = (2 * 4 + 2) * 4;
		expect(fb[o]).toBeGreaterThan(200); // R
	}, 30000);

	it("unsupported bytes fail loudly with the operation name", async () => {
		const result = await run(
			Effect.gen(function* () {
				const picture = yield* Picture.make();
				return yield* Effect.result(
					Picture.load(picture, new Uint8Array([9, 9, 9, 9, 9])),
				);
			}),
		);
		expect(result._tag).toBe("Failure");
		if (result._tag === "Failure") {
			expect(result.failure._tag).toBe("ThorvgException");
			expect(result.failure.operation).toBe("_tvg_picture_load_data");
		}
	}, 30000);

	it("a detached picture keeps its finalizer (owned stays true)", async () => {
		const stillOwned = await run(
			Effect.gen(function* () {
				const picture = yield* Picture.make();
				yield* Picture.load(picture, greenPng, { type: "png" });
				return yield* Ref.get(picture.owned);
			}),
		);
		expect(stillOwned).toBe(true);
	}, 30000);
});
