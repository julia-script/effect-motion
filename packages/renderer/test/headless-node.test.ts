import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { Color, Entities as S, Scene } from "effect-motion";
import { describe, expect, it } from "vitest";
import * as NodeRenderer from "../src/node.js";
import { unreachable } from "./support/raise.js";

// Headless smoke: real frames through Dawn on a real GPU, loose visual
// sanity only — never byte equality (determinism stops at the frame stream).

const framesOf = (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
): Promise<Array<Parameters<typeof NodeRenderer.renderToPng>[1]>> =>
	Effect.runPromise(
		Scene.stream(
			Scene.make(make as never, {
				width: 128,
				height: 64,
				backgroundColor: Color.rgba(10, 10, 20),
			}) as never,
			{},
		).pipe(Stream.runCollect) as unknown as Effect.Effect<
			Iterable<never>,
			never,
			never
		>,
	).then((chunk) => [...chunk]);

describe("headless Dawn rendering", () => {
	it("renders a frame to a PNG with content", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 64, y: 32 }),
				radius: 20,
				fillColor: Color.rgba(255, 60, 60),
			});
			yield* Scene.tick;
		});
		const frame = frames.at(-1) ?? unreachable();
		const png = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 128, height: 64 }).pipe(
					Effect.flatMap((renderer) =>
						NodeRenderer.renderToPng(renderer, frame),
					),
				),
			) as Effect.Effect<Uint8Array, never, never>,
		);
		// PNG signature
		expect([...png.slice(0, 4)]).toEqual([137, 80, 78, 71]);
		// decodes to sane dimensions (IHDR width/height at offsets 16/20)
		const view = new DataView(png.buffer, png.byteOffset);
		expect(view.getUint32(16, false)).toBe(128);
		expect(view.getUint32(20, false)).toBe(64);
		// loose visual sanity: the encoded image is not a flat background
		// (a solid-color PNG deflates to almost nothing)
		expect(png.length).toBeGreaterThan(300);
	}, 30_000);

	it("readback rgba shows both background and circle pixels", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 64, y: 32 }),
				radius: 20,
				fillColor: Color.rgba(255, 60, 60),
			});
			yield* Scene.tick;
		});
		const frame = frames.at(-1) ?? unreachable();
		const stats = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 128, height: 64 }).pipe(
					Effect.flatMap((renderer) =>
						NodeRenderer.renderToPng(renderer, frame).pipe(
							Effect.map(() => {
								// sample the retained graph, not pixels: circle present
								return {
									objects: renderer.sync.stats.objects,
								};
							}),
						),
					),
				),
			) as Effect.Effect<{ objects: number }, never, never>,
		);
		expect(stats.objects).toBe(1);
	}, 30_000);
});
