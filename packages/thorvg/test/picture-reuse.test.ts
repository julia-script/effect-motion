import { Effect, type Scope } from "effect";
import { describe, expect, it } from "vitest";
import * as Canvas from "../src/Canvas";
import type { ThorvgWasm } from "../src/Engine";
import * as EngineNode from "../src/EngineNode";
import * as Paint from "../src/Paint";
import * as Picture from "../src/Picture";
import { encodePng } from "../src/png";
import * as Scene from "../src/Scene";
import * as Shape from "../src/Shape";
import { unreachable } from "./raise";

/**
 * Spike for image-assets design D2: (1) session pictures are reused per frame
 * via Paint.duplicate — verify duplicates render correctly and aren't
 * prohibitively expensive; (2) pictures positioned via setTransform inside a
 * nested scene actually move (Text has a verified quirk where set_transform
 * on a nested-scene child renders nothing — rule it out for pictures).
 */

const run = <A, E>(effect: Effect.Effect<A, E, ThorvgWasm | Scope.Scope>) =>
	Effect.runPromise(
		effect.pipe(Effect.scoped, Effect.provide(EngineNode.layer("sw", {}))),
	);

// an 8×8 solid green PNG via the package's own encoder
const greenPng = (() => {
	const rgba = new Uint8Array(8 * 8 * 4);
	for (let i = 0; i < rgba.length; i += 4) {
		rgba[i + 1] = 255;
		rgba[i + 3] = 255;
	}
	return encodePng(rgba, 8, 8);
})();

const px = (
	fb: Uint8Array,
	width: number,
	x: number,
	y: number,
): [number, number, number, number] => {
	const o = (y * width + x) * 4;
	return [
		fb[o] ?? unreachable(),
		fb[o + 1] ?? unreachable(),
		fb[o + 2] ?? unreachable(),
		fb[o + 3] ?? unreachable(),
	];
};

// SW canvas targets are malloc'd (uninitialized) — every render test must
// paint a full background first or empty pixels read as garbage
const addBackground = (
	scene: import("../src/Interop").OwnedPaint,
	w: number,
	h: number,
) =>
	Effect.gen(function* () {
		const bg = yield* Shape.make();
		yield* Shape.appendRect(bg, 0, 0, w, h);
		yield* Shape.setFillColor(bg, 0, 0, 32);
		yield* Scene.add(scene, bg);
	});

describe("picture reuse spike (image-assets D2)", () => {
	it("duplicates of one loaded picture render independently at their own transforms", async () => {
		const fb = await run(
			Effect.gen(function* () {
				const canvas = yield* Canvas.make(64, 24);
				const scene = yield* Scene.make();
				yield* addBackground(scene, 64, 24);

				// the "session-held" source picture: loaded once, stays detached
				const source = yield* Picture.make();
				yield* Picture.load(source, greenPng, { type: "png" });

				// three per-frame duplicates at x = 0, 24, 48
				for (const x of [0, 24, 48]) {
					const dup = yield* Paint.duplicate(source);
					yield* Paint.translate(dup, x, 8);
					yield* Scene.add(scene, dup);
				}

				yield* Canvas.add(canvas, scene);
				yield* Canvas.update(canvas);
				yield* Canvas.draw(canvas);
				yield* Canvas.sync(canvas);
				return new Uint8Array(yield* Canvas.render(canvas));
			}),
		);
		// each duplicate's 8×8 footprint is green at its own offset
		for (const x of [0, 24, 48]) {
			const [r, g] = px(fb, 64, x + 4, 12);
			expect(g).toBeGreaterThan(200);
			expect(r).toBeLessThan(50);
		}
		// gaps between duplicates stay empty
		expect(px(fb, 64, 16, 12)[1]).toBeLessThan(50);
		expect(px(fb, 64, 40, 12)[1]).toBeLessThan(50);
	}, 30000);

	it("duplicate is cheap enough for per-frame use (512×512 source, 100 dups)", async () => {
		const timing = await run(
			Effect.gen(function* () {
				// a 1 MiB raw source — if duplicate deep-copied pixels, 100 dups
				// would move ~100 MiB and show up hard in the timing
				const big = new Uint8Array(512 * 512 * 4).fill(128);
				const source = yield* Picture.make();
				yield* Picture.loadRaw(source, big, { width: 512, height: 512 });

				const t0 = performance.now();
				for (let i = 0; i < 100; i++) {
					// scoped so the duplicates free immediately (detached paints)
					yield* Effect.scoped(Paint.duplicate(source));
				}
				return performance.now() - t0;
			}),
		);
		// eslint-disable-next-line no-console
		console.info(
			`[spike] 100 duplicates of 512×512 raw: ${timing.toFixed(2)}ms`,
		);
		// generous bound: even 0.5ms/dup is fine for per-frame use; a pixel
		// deep-copy of 1 MiB × 100 would land far above this on any machine
		expect(timing).toBeLessThan(250);
	}, 30000);

	it("setTransform on a nested-scene picture positions it (no Text-style quirk)", async () => {
		const fb = await run(
			Effect.gen(function* () {
				const canvas = yield* Canvas.make(64, 64);
				const scene = yield* Scene.make();
				yield* addBackground(scene, 64, 64);

				const source = yield* Picture.make();
				yield* Picture.load(source, greenPng, { type: "png" });
				const dup = yield* Paint.duplicate(source);
				// scale ×2 and translate to (32, 32): footprint (32,32)..(48,48)
				yield* Paint.setTransform(dup, {
					a: 2,
					b: 0,
					c: 0,
					d: 2,
					e: 32,
					f: 32,
				});
				yield* Scene.add(scene, dup);

				yield* Canvas.add(canvas, scene);
				yield* Canvas.update(canvas);
				yield* Canvas.draw(canvas);
				yield* Canvas.sync(canvas);
				return new Uint8Array(yield* Canvas.render(canvas));
			}),
		);
		// inside the transformed footprint: green
		expect(px(fb, 64, 40, 40)[1]).toBeGreaterThan(200);
		// original (untransformed) position: empty — the transform was honored
		expect(px(fb, 64, 4, 4)[1]).toBeLessThan(50);
		// beyond the scaled footprint: empty — scale was honored too
		expect(px(fb, 64, 56, 56)[1]).toBeLessThan(50);
	}, 30000);
});
