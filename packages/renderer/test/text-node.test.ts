import type { LayoutResult } from "@text-rendering-toolkit/layout";
import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { Color, Entity as S, Scene } from "effect-motion";
import * as Font from "effect-motion/Font";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import * as NodeRenderer from "../src/node.js";
import * as Text from "../src/Text.js";
import { unreachable } from "./support/raise.js";

// SDF text on the headless path: real typesetting (default Inter font,
// fetched module-cached), real glyph SDFs, real GPU render. Assertions are
// structural + loose visual sanity — never byte equality.

const framesOf = (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
): Promise<Array<Parameters<typeof NodeRenderer.renderToPng>[1]>> =>
	Effect.runPromise(
		Scene.stream(
			Scene.make(make as never, {
				width: 256,
				height: 96,
				backgroundColor: Color.rgba(10, 10, 20),
			}) as never,
			{},
		).pipe(Stream.runCollect) as unknown as Effect.Effect<
			Iterable<never>,
			never,
			never
		>,
	).then((chunk) => [...chunk]);

describe("SDF text, headless", () => {
	it("renders text with the auto-provided default font", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate("Text", {
				// center-origin frame: baseline-left a bit left of and below
				// center keeps the whole string inside the 256x96 viewport
				position: S.vec3({ x: -100, y: -10 }),
				text: "Hello",
				fontSize: 40,
				fillColor: Color.rgba(255, 255, 255),
			});
			yield* Scene.tick;
		});
		const frame = frames.at(-1) ?? unreachable();
		const png = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 256, height: 96 }).pipe(
					Effect.flatMap((renderer) =>
						NodeRenderer.renderToPng(renderer, frame),
					),
				),
			) as Effect.Effect<Uint8Array, never, never>,
		);
		expect([...png.slice(0, 4)]).toEqual([137, 80, 78, 71]);
		// glyphs add real content: a text frame deflates far larger than the
		// flat background alone (~200 bytes)
		expect(png.length).toBeGreaterThan(1000);
	}, 60_000);

	it("a missing custom font loader dies naming the font id", async () => {
		const frames = await framesOf(function* () {
			const font = { _tag: "effect-motion/Resources/Font", id: "Comic" };
			yield* Scene.instantiate("Text", {
				text: "nope",
				fontFamily: font as never,
			});
			yield* Scene.tick;
		});
		const frame = frames.at(-1) ?? unreachable();
		const exit = await Effect.runPromiseExit(
			Effect.scoped(
				NodeRenderer.make({ width: 256, height: 96 }).pipe(
					Effect.flatMap((renderer) =>
						NodeRenderer.renderToPng(renderer, frame),
					),
				),
			) as Effect.Effect<Uint8Array, unknown, never>,
		);
		expect(exit._tag).toBe("Failure");
		// JSON.stringify drops Error internals; surface defect messages
		const rendered = JSON.stringify(exit, (_key, value) =>
			value instanceof Error ? value.message : value,
		);
		expect(rendered).toContain("Comic");
	}, 60_000);

	it("multi-line layout stacks downward in y-up layout space (no double flip)", async () => {
		// asymmetric two-line layout: line 2 must sit BELOW line 1, which in
		// the y-up layout frame means a strictly smaller baseline — a stray
		// extra flip at the font-metric boundary would invert this and cannot
		// cancel out
		const actor = Text.make();
		await Effect.runPromise(
			Effect.flatMap(Font.loadDefaultBytes, (bytes) =>
				Text.registerFont(actor, "probe", bytes),
			) as Effect.Effect<void, never, never>,
		);
		const result = await Effect.runPromise(
			Text.layout(actor, {
				text: "WIDE FIRST LINE\nx",
				fontId: "probe",
				fontSize: 32,
			}) as Effect.Effect<LayoutResult, never, never>,
		);
		expect(result.lines.length).toBe(2);
		const first = result.lines[0] ?? unreachable();
		const second = result.lines[1] ?? unreachable();
		expect(second.baseline).toBeLessThan(first.baseline);
		// default anchor: baseline-left of line 1 at (0, 0)
		expect(first.baseline).toBeCloseTo(0, 5);
		const firstGlyph = result.glyphs[0] ?? unreachable();
		expect(firstGlyph.y).toBeCloseTo(0, 5);
		Text.dispose(actor);
	}, 60_000);

	// ── three-text spec scenarios: blending and occlusion ────────────────
	// Behavioral pixel statistics over headless renders — luminance extrema,
	// never byte equality (determinism is frame-level, not pixel-exact).

	const renderScene = (
		make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	): Promise<PNG> =>
		framesOf(make).then(async (frames) => {
			const frame = frames.at(-1) ?? unreachable();
			const png = await Effect.runPromise(
				Effect.scoped(
					NodeRenderer.make({ width: 256, height: 96 }).pipe(
						Effect.flatMap((renderer) =>
							NodeRenderer.renderToPng(renderer, frame),
						),
					),
				) as Effect.Effect<Uint8Array, never, never>,
			);
			return PNG.sync.read(Buffer.from(png));
		});

	const luminanceExtrema = (png: PNG): { min: number; max: number } => {
		let min = 255;
		let max = 0;
		for (let i = 0; i < png.data.length; i += 4) {
			const r = png.data[i] ?? 0;
			const g = png.data[i + 1] ?? 0;
			const b = png.data[i + 2] ?? 0;
			const luminance = (r + g + b) / 3;
			min = Math.min(min, luminance);
			max = Math.max(max, luminance);
		}
		return { min, max };
	};

	it("overlapping ink blends exactly once at partial opacity", async () => {
		// two identical semi-transparent strings stacked at the same position:
		// their core ink shares one depth, so the second core fails the
		// depth-ink LessDepth test and every ink pixel blends ONCE — the
		// stacked frame's brightest ink must not exceed the single frame's.
		// Double blending would compose 0.5 over 0.5 and read clearly brighter.
		const textProps = {
			position: S.vec3({ x: -100, y: -10 }),
			text: "OVERLAP",
			fontSize: 40,
			fillColor: Color.rgba(255, 255, 255),
			opacity: 0.5,
		};
		const single = await renderScene(function* () {
			yield* Scene.instantiate("Text", textProps);
			yield* Scene.tick;
		});
		const stacked = await renderScene(function* () {
			yield* Scene.instantiate("Text", textProps);
			yield* Scene.instantiate("Text", textProps);
			yield* Scene.tick;
		});
		const singleMax = luminanceExtrema(single).max;
		const stackedMax = luminanceExtrema(stacked).max;
		// ink is meaningfully brighter than the rgba(10,10,20) background
		expect(singleMax).toBeGreaterThan(80);
		// AA-scale tolerance only — no double-blend step
		expect(stackedMax).toBeLessThanOrEqual(singleMax + 8);
	}, 60_000);

	it("text ink occludes a shape behind it; non-ink regions do not", async () => {
		const png = await renderScene(function* () {
			yield* Scene.instantiate("Rect", {
				width: 240,
				height: 90,
				fillColor: Color.rgba(255, 255, 255),
			});
			yield* Scene.instantiate("Text", {
				// z toward the camera: the text sits in front of the rect
				position: S.vec3({ x: -60, y: -12, z: 50 }),
				text: "INK",
				fontSize: 48,
				fillColor: Color.rgba(0, 0, 0),
			});
			yield* Scene.tick;
		});
		const { min, max } = luminanceExtrema(png);
		// dark ink is visible over the white rect...
		expect(min).toBeLessThan(60);
		// ...while non-ink regions still show the rect
		expect(max).toBeGreaterThan(200);
	}, 60_000);

	it("text ink sits above a coplanar backdrop on every frame", async () => {
		const png = await renderScene(function* () {
			yield* Scene.instantiate("Text", {
				position: S.vec3({ x: -60, y: -12 }),
				text: "INK",
				fontSize: 48,
				fillColor: Color.rgba(0, 0, 0),
			});
			// same depth, instantiated after the text — the z-lift plus the
			// depth-ink core keeps the glyphs deterministically on top
			yield* Scene.instantiate("Rect", {
				width: 240,
				height: 90,
				fillColor: Color.rgba(255, 255, 255),
			});
			yield* Scene.tick;
		});
		const { min, max } = luminanceExtrema(png);
		expect(min).toBeLessThan(60);
		expect(max).toBeGreaterThan(200);
	}, 60_000);
});
