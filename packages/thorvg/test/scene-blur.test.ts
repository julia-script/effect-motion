import { Effect, type Scope } from "effect";
import { describe, expect, it } from "vitest";
import * as Canvas from "../src/Canvas";
import type { ThorvgWasm } from "../src/Engine";
import * as EngineNode from "../src/EngineNode";
import type { OwnedPaint } from "../src/Interop";
import * as Paint from "../src/Paint";
import * as Scene from "../src/Scene";
import * as Shape from "../src/Shape";
import * as Text from "../src/Text";

/**
 * Spike for camera-depth-of-field design D4: gaussian blur as a nested-scene
 * effect. (a) a blurred sub-scene blurs ONLY its subtree while root-level
 * siblings stay sharp; (b) one blur pass is affordable at player sizes;
 * (c) translate-positioned text still renders two scene levels deep (the
 * one-level transform quirk's big sibling).
 *
 * Blur params (verified against upstream webcanvas): direction 0 = both
 * axes, border 0 = duplicate, quality 0-100 (upstream default 75).
 */

const run = <A, E>(effect: Effect.Effect<A, E, ThorvgWasm | Scope.Scope>) =>
	Effect.runPromise(
		effect.pipe(Effect.scoped, Effect.provide(EngineNode.layer("sw", {}))),
	);

const px = (
	fb: Uint8Array,
	width: number,
	x: number,
	y: number,
): [number, number, number, number] => {
	const o = (y * width + x) * 4;
	return [fb[o]!, fb[o + 1]!, fb[o + 2]!, fb[o + 3]!];
};

const addBackground = (scene: OwnedPaint, w: number, h: number) =>
	Effect.gen(function* () {
		const bg = yield* Shape.make();
		yield* Shape.appendRect(bg, 0, 0, w, h);
		yield* Shape.setFillColor(bg, 0, 0, 0);
		yield* Scene.add(scene, bg);
	});

const addRect = (
	parent: OwnedPaint,
	x: number,
	y: number,
	w: number,
	h: number,
) =>
	Effect.gen(function* () {
		const rect = yield* Shape.make();
		yield* Shape.appendRect(rect, x, y, w, h);
		yield* Shape.setFillColor(rect, 0, 255, 0);
		yield* Scene.add(parent, rect);
	});

describe("scene blur spike (camera-depth-of-field D4)", () => {
	it("a blurred sub-scene blurs its subtree only; root siblings stay sharp", async () => {
		const fb = await run(
			Effect.gen(function* () {
				const canvas = yield* Canvas.make(200, 100);
				const root = yield* Scene.make();
				yield* addBackground(root, 200, 100);

				// blurred bucket: a 40×40 rect at (20,30) inside a nested scene
				// with gaussian blur sigma 6
				const bucket = yield* Scene.make();
				yield* addRect(bucket, 20, 30, 40, 40);
				yield* Scene.addGaussianBlur(bucket, 6, 0, 0, 75);
				yield* Scene.add(root, bucket);

				// sharp sibling: same-size rect at (120,30) directly in root
				yield* addRect(root, 120, 30, 40, 40);

				yield* Canvas.add(canvas, root);
				yield* Canvas.update(canvas);
				yield* Canvas.draw(canvas);
				yield* Canvas.sync(canvas);
				return new Uint8Array(yield* Canvas.render(canvas));
			}),
		);
		// blurred rect: center still green, hard edge gone — the pixel just
		// OUTSIDE the footprint has blur spill, the pixel just inside is no
		// longer full-intensity at the boundary
		expect(px(fb, 200, 40, 50)[1]).toBeGreaterThan(100); // center green-ish
		const spillOutside = px(fb, 200, 66, 50)[1]; // 6px outside right edge
		expect(spillOutside).toBeGreaterThan(8); // blur bleeds past the edge
		const blurredEdge = px(fb, 200, 21, 50)[1]; // just inside left edge
		expect(blurredEdge).toBeLessThan(230); // softened, not solid

		// sharp sibling: hard edge — full green just inside, background just
		// outside, no spill
		expect(px(fb, 200, 121, 50)[1]).toBeGreaterThan(240);
		expect(px(fb, 200, 118, 50)[1]).toBeLessThan(10);
		expect(px(fb, 200, 166, 50)[1]).toBeLessThan(10);
	}, 30000);

	it("blur pass cost at player sizes (recorded for design D4)", async () => {
		const timeAt = (w: number, h: number, sigma: number) =>
			Effect.gen(function* () {
				const canvas = yield* Canvas.make(w, h);
				const root = yield* Scene.make();
				yield* addBackground(root, w, h);
				const bucket = yield* Scene.make();
				// content covering ~half the canvas — a realistic blur region
				yield* addRect(bucket, 0, 0, w / 2, h);
				yield* Scene.addGaussianBlur(bucket, sigma, 0, 0, 75);
				yield* Scene.add(root, bucket);
				yield* Canvas.add(canvas, root);
				yield* Canvas.update(canvas);
				const t0 = performance.now();
				yield* Canvas.draw(canvas);
				yield* Canvas.sync(canvas);
				yield* Canvas.render(canvas);
				return performance.now() - t0;
			});

		const timings = await run(
			Effect.gen(function* () {
				return {
					smallSigma2: yield* Effect.scoped(timeAt(500, 300, 2)),
					smallSigma12: yield* Effect.scoped(timeAt(500, 300, 12)),
					playerSigma2: yield* Effect.scoped(timeAt(875, 525, 2)),
					playerSigma12: yield* Effect.scoped(timeAt(875, 525, 12)),
				};
			}),
		);
		// record the numbers (vitest may swallow the log; the assertion below is
		// the actual gate: a pass must not blow the 16ms frame budget by itself)
		console.info("[spike] blur pass ms:", JSON.stringify(timings));
		expect(timings.playerSigma12).toBeLessThan(16);
	}, 30000);

	it("translate-positioned text renders inside a blurred sub-scene (two levels deep)", async () => {
		const painted = await run(
			Effect.gen(function* () {
				// needs glyphs: load the default sans via a canvas-lifetime fetch
				const bytes = yield* Effect.promise(() =>
					fetch(
						"https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_400Regular.ttf",
					)
						.then((r) => r.arrayBuffer())
						.then((b) => new Uint8Array(b)),
				);
				const Font = yield* Effect.promise(() => import("../src/Font"));
				yield* Font.loadData("blur-spike", bytes);

				const canvas = yield* Canvas.make(200, 80);
				const root = yield* Scene.make();
				yield* addBackground(root, 200, 80);

				const bucket = yield* Scene.make();
				const text = yield* Text.make();
				yield* Text.setFont(text, "blur-spike");
				yield* Text.setText(text, "Hello");
				yield* Text.setSize(text, 40);
				yield* Text.setColor(text, 255, 255, 255);
				yield* Paint.translate(text, 10, 55);
				yield* Scene.add(bucket, text);
				yield* Scene.addGaussianBlur(bucket, 3, 0, 0, 75);
				yield* Scene.add(root, bucket);

				yield* Canvas.add(canvas, root);
				yield* Canvas.update(canvas);
				yield* Canvas.draw(canvas);
				yield* Canvas.sync(canvas);
				const fb = new Uint8Array(yield* Canvas.render(canvas));
				let n = 0;
				for (let i = 0; i < fb.length; i += 4) {
					if (fb[i]! > 40) n++;
				}
				return n;
			}),
		);
		// blurred glyphs still paint plenty of pixels; zero means the two-level
		// quirk exists and text must pin to sharp root-level runs
		expect(painted).toBeGreaterThan(500);
	}, 30000);
});
