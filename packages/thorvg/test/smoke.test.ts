import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Ref, type Scope } from "effect";
import { describe, expect, it } from "vitest";
import * as Canvas from "../src/Canvas";
import type { ThorvgWasm } from "../src/Engine";
import * as EngineNode from "../src/EngineNode";
import * as Gradient from "../src/Gradient";
import * as Paint from "../src/Paint";
import { encodePng } from "../src/png";
import * as Shape from "../src/Shape";
import * as Text from "../src/Text";
import { unreachable } from "./raise";

// no fonts by default — the shape/canvas smokes don't need text, and this
// keeps them off the network (the default font would otherwise fetch on acquire)
const run = <A, E>(effect: Effect.Effect<A, E, ThorvgWasm | Scope.Scope>) =>
	Effect.runPromise(
		effect.pipe(Effect.scoped, Effect.provide(EngineNode.layer("sw", {}))),
	);

// the text smoke explicitly loads the default font (one network fetch)
const runWithFont = <A, E>(
	effect: Effect.Effect<A, E, ThorvgWasm | Scope.Scope>,
) =>
	Effect.runPromise(
		effect.pipe(Effect.scoped, Effect.provide(EngineNode.layer("sw"))),
	);

describe("thorvg smoke", () => {
	it("draws a filled rect to a buffer with correct cleanup", async () => {
		const buffer = await run(
			Effect.gen(function* () {
				const canvas = yield* Canvas.make(100, 100);
				const rect = yield* Shape.make();
				yield* Shape.appendRect(rect, 10, 10, 80, 80);
				yield* Shape.setFillColor(rect, 255, 0, 0);
				yield* Canvas.add(canvas, rect);
				yield* Canvas.update(canvas);
				yield* Canvas.draw(canvas);
				yield* Canvas.sync(canvas);
				return yield* Canvas.render(canvas);
			}),
		);
		// SW render() returns the framebuffer (100*100*4 bytes)
		expect(buffer.byteLength).toBe(100 * 100 * 4);
		// pin the buffer layout the PNG/blit adapters depend on: the rect fills
		// (10,10)..(90,90) opaque red, so the pixel at (50,50) must be straight
		// RGBA8888 [255,0,0,255] — no channel swizzle, no premultiply surprise.
		// A layout regression fails here, not silently downstream.
		const bytes = new Uint8Array(buffer);
		const o = (50 * 100 + 50) * 4;
		expect([bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]]).toEqual([
			255, 0, 0, 255,
		]);
	});

	it("add transfers ownership: the added child's finalizer is disarmed", async () => {
		const stillOwned = await run(
			Effect.gen(function* () {
				const canvas = yield* Canvas.make(50, 50);
				const rect = yield* Shape.make();
				yield* Shape.appendRect(rect, 0, 0, 10, 10);
				yield* Canvas.add(canvas, rect);
				// after add, the Scope no longer owns the free (parent owns it)
				return yield* Ref.get(rect.owned);
			}),
		);
		expect(stillOwned).toBe(false);
	});

	it("a detached paint keeps its finalizer (owned stays true)", async () => {
		const stillOwned = await run(
			Effect.gen(function* () {
				const rect = yield* Shape.make();
				yield* Shape.appendRect(rect, 0, 0, 10, 10);
				return yield* Ref.get(rect.owned);
			}),
		);
		expect(stillOwned).toBe(true);
	});

	it("get_aabb reads bounds from scratch memory", async () => {
		const aabb = await run(
			Effect.gen(function* () {
				const rect = yield* Shape.make();
				yield* Shape.appendRect(rect, 10, 20, 30, 40);
				yield* Paint.getAabb(rect);
				return yield* Paint.getAabb(rect);
			}),
		);
		expect(aabb.w).toBeCloseTo(30, 1);
		expect(aabb.h).toBeCloseTo(40, 1);
	});

	it("packs gradient color stops into scratch and sets them", async () => {
		// exercises the only non-trivial scratch-write path (writeF32 + writeBytes)
		await run(
			Effect.gen(function* () {
				const grad = yield* Gradient.makeLinear();
				yield* Gradient.setColorStops(grad, [
					{ offset: 0, r: 255, g: 0, b: 0, a: 255 },
					{ offset: 1, r: 0, g: 0, b: 255, a: 255 },
				]);
			}),
		);
		// success = no ThorvgException; a bad struct layout returns a non-zero code
		expect(true).toBe(true);
	});

	it("encodePng produces a valid PNG with correct IHDR", () => {
		const png = encodePng(new Uint8Array(2 * 2 * 4), 2, 2);
		expect(Array.from(png.subarray(0, 8))).toEqual([
			137, 80, 78, 71, 13, 10, 26, 10,
		]);
		const view = new DataView(png.buffer, png.byteOffset);
		expect(view.getUint32(16, false)).toBe(2); // IHDR width
		expect(view.getUint32(20, false)).toBe(2); // IHDR height
		expect(png[25]).toBe(6); // color type: RGBA
	});

	it("encodePng rejects a mismatched buffer size", () => {
		expect(() => encodePng(new Uint8Array(10), 4, 4)).toThrow(/expected 64/);
	});

	it("savePng writes a decodable PNG of the drawn canvas", async () => {
		const file = join(tmpdir(), `thorvg-savepng-${process.pid}.png`);
		try {
			await run(
				Effect.gen(function* () {
					const canvas = yield* Canvas.make(64, 48);
					const rect = yield* Shape.make();
					yield* Shape.appendRect(rect, 8, 8, 48, 32, 6, 6);
					yield* Shape.setFillColor(rect, 255, 80, 0);
					yield* Canvas.add(canvas, rect);
					yield* Canvas.update(canvas);
					yield* Canvas.draw(canvas);
					yield* Canvas.sync(canvas);
					yield* EngineNode.savePng(canvas, file);
				}),
			);
			const bytes = await readFile(file);
			expect(Array.from(bytes.subarray(0, 8))).toEqual([
				137, 80, 78, 71, 13, 10, 26, 10,
			]);
			expect(bytes.readUInt32BE(16)).toBe(64); // width
			expect(bytes.readUInt32BE(20)).toBe(48); // height
		} finally {
			await rm(file, { force: true });
		}
	});

	// network: fetches the default font from the CDN, then renders text. Tagged
	// so it can be excluded offline; proves the engine-setup font path + the
	// text wrappers end-to-end.
	it("loads the default font and renders text glyphs", async () => {
		const painted = await runWithFont(
			Effect.gen(function* () {
				const canvas = yield* Canvas.make(200, 80);
				const text = yield* Text.make();
				yield* Text.setFont(text, "sans-serif");
				yield* Text.setText(text, "Hello");
				yield* Text.setSize(text, 40);
				yield* Text.setColor(text, 255, 255, 255);
				yield* Paint.translate(text, 10, 55);
				yield* Canvas.add(canvas, text);
				yield* Canvas.update(canvas);
				yield* Canvas.draw(canvas);
				yield* Canvas.sync(canvas);
				const fb = new Uint8Array(yield* Canvas.render(canvas));
				let n = 0;
				for (let i = 0; i < fb.length; i += 4) {
					if ((fb[i] ?? unreachable()) > 40) n++;
				}
				return n;
			}),
		);
		// glyphs painted (probe measured ~11.5k for this string/size)
		expect(painted).toBeGreaterThan(500);
	}, 20000);
});
