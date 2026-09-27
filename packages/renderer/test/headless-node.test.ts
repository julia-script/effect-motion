import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { Color, Entity as S, Scene } from "effect-motion";
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
				// center-origin frame: (0, 0) is the middle of the viewport
				position: S.vec3({}),
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
				// center-origin frame: (0, 0) is the middle of the viewport
				position: S.vec3({}),
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

	it("pixels honor a rotated, scaled Group and a fading Group", async () => {
		const frames = await framesOf(function* () {
			// a 20×4 bar, turned 90° and doubled by its group → an 8×40 column
			const bar = yield* Scene.instantiate("Rect", {
				width: 20,
				height: 4,
				fillColor: Color.rgba(255, 255, 255),
			});
			yield* Scene.instantiate("Group", {
				position: S.vec3({ x: -30 }),
				rotation: S.vec3({ z: Math.PI / 2 }),
				scale: S.vec3({ x: 2, y: 2, z: 1 }),
				children: [bar],
			});
			// a white dot inside a half-faded group
			const dot = yield* Scene.instantiate("Circle", {
				radius: 10,
				fillColor: Color.rgba(255, 255, 255),
			});
			yield* Scene.instantiate("Group", {
				position: S.vec3({ x: 30 }),
				opacity: 0.5,
				children: [dot],
			});
			yield* Scene.tick;
		});
		const frame = frames.at(-1) ?? unreachable();
		const { rgba, width } = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 128, height: 64 }).pipe(
					Effect.flatMap((renderer) =>
						NodeRenderer.renderToRgba(renderer, frame).pipe(
							Effect.map((rgba) => ({ rgba, width: renderer.pixelWidth })),
						),
					),
				),
			) as Effect.Effect<{ rgba: Uint8Array; width: number }, never, never>,
		);
		// red channel at scene (x, y); y up, origin at the viewport center
		const red = (x: number, y: number) =>
			rgba[((32 - y) * width + (64 + x)) * 4] ?? unreachable();
		// the column reaches 15 above the bar's center…
		expect(red(-30, 15)).toBeGreaterThan(200);
		// …and not 15 to its side, where the unrotated bar would be
		expect(red(-15, 0)).toBeLessThan(40);
		// the faded dot is partway to white (50% blends in linear light, so
		// ~188 after sRGB encoding) — neither background nor full white
		expect(red(30, 0)).toBeGreaterThan(140);
		expect(red(30, 0)).toBeLessThan(230);
	}, 30_000);

	it("a Scene.play comp keeps the inline orientation", async () => {
		// asymmetric content: a dot above center. A flipped comp texture
		// would land it below.
		const content = function* () {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ y: 16 }),
				radius: 8,
				fillColor: Color.rgba(255, 255, 255),
			});
			yield* Scene.tick;
		};
		const inner = Scene.make(content as never, { width: 128, height: 64 });
		const redAt = async (frames: Awaited<ReturnType<typeof framesOf>>) => {
			const frame = frames.at(-1) ?? unreachable();
			const rgba = await Effect.runPromise(
				Effect.scoped(
					NodeRenderer.make({ width: 128, height: 64 }).pipe(
						Effect.flatMap((renderer) =>
							NodeRenderer.renderToRgba(renderer, frame),
						),
					),
				) as Effect.Effect<Uint8Array, never, never>,
			);
			return (x: number, y: number) =>
				rgba[((32 - y) * 128 + (64 + x)) * 4] ?? unreachable();
		};
		const inline = await redAt(await framesOf(content));
		const comp = await redAt(
			await framesOf(function* () {
				const h = yield* Scene.play(inner as never);
				yield* h.finished;
			}),
		);
		for (const red of [inline, comp]) {
			expect(red(0, 16)).toBeGreaterThan(200);
			expect(red(0, -16)).toBeLessThan(40);
		}
	}, 30_000);
});
