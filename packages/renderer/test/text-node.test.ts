import type { LayoutResult } from "@text-rendering-toolkit/layout";
import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { Color, Entity as S, Scene } from "effect-motion";
import * as Font from "effect-motion/Font";
import * as Image from "effect-motion/Image";
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
	width = 256,
): Promise<Array<Parameters<typeof NodeRenderer.renderToPng>[1]>> =>
	Effect.runPromise(
		Scene.stream(
			Scene.make(make as never, {
				width,
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
		width = 256,
	): Promise<PNG> =>
		framesOf(make, width).then(async (frames) => {
			const frame = frames.at(-1) ?? unreachable();
			const png = await Effect.runPromise(
				Effect.scoped(
					NodeRenderer.make({ width, height: 96 }).pipe(
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

	it("stacked semi-transparent strings composite as layers", async () => {
		// two identical 50% strings at the same depth are two layers: the
		// later one paints over the earlier (paint order), so their ink
		// composes 0.5 over 0.5 and reads clearly brighter than one — the
		// depth-ink dedupe stays within a single string
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
		expect(stackedMax).toBeGreaterThan(singleMax + 30);
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

	// ── paint order: equal depth is decided by tree order ───────────────
	// Pixel counts over the 240x90 backdrop's interior, compared with a
	// reference where real depth (not a tie) decides — hollow outlines or
	// a punched hole would lose most of the glyph pixels. Rendered 1920 wide:
	// the camera sits as far back as at 1080p, where depth precision is
	// coarse enough for ties to fight (a 256-wide frame hides the bug).
	const WIDE = 1920;
	const renderWide = (
		make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	): Promise<PNG> => renderScene(make, WIDE);

	const countInBackdrop = (
		png: PNG,
		matches: (r: number, g: number, b: number) => boolean,
	): number => {
		let count = 0;
		const left = (WIDE - 240) / 2;
		for (let y = 6; y < 90; y++) {
			for (let x = left + 4; x < left + 236; x++) {
				const i = (y * png.width + x) * 4;
				count += matches(
					png.data[i] ?? 0,
					png.data[i + 1] ?? 0,
					png.data[i + 2] ?? 0,
				)
					? 1
					: 0;
			}
		}
		return count;
	};
	const dark = (r: number, g: number, b: number) => (r + g + b) / 3 < 60;
	const backdrop = {
		width: 240,
		height: 90,
		fillColor: Color.rgba(255, 255, 255),
	};
	const ink = (z: number) => ({
		position: S.vec3({ x: -60, y: -12, z }),
		text: "INK",
		fontSize: 48,
		fillColor: Color.rgba(0, 0, 0),
	});

	it("text on a same-z backdrop renders solid glyphs", async () => {
		// reference: text genuinely nearer, so depth alone puts it on top
		const reference = await renderWide(function* () {
			yield* Scene.instantiate("Rect", backdrop);
			yield* Scene.instantiate("Text", ink(2));
			yield* Scene.tick;
		});
		const tied = await renderWide(function* () {
			yield* Scene.instantiate("Rect", backdrop);
			yield* Scene.instantiate("Text", ink(0));
			yield* Scene.tick;
		});
		const expected = countInBackdrop(reference, dark);
		expect(expected).toBeGreaterThan(500);
		expect(countInBackdrop(tied, dark)).toBeGreaterThan(expected * 0.9);
	}, 60_000);

	it("a later same-z backdrop covers the text; nearer text still wins", async () => {
		const covered = await renderWide(function* () {
			yield* Scene.instantiate("Text", ink(0));
			yield* Scene.instantiate("Rect", backdrop);
			yield* Scene.tick;
		});
		expect(countInBackdrop(covered, dark)).toBe(0);
		// genuinely different depth beats tree order
		const nearer = await renderWide(function* () {
			yield* Scene.instantiate("Text", ink(2));
			yield* Scene.instantiate("Rect", backdrop);
			yield* Scene.tick;
		});
		expect(countInBackdrop(nearer, dark)).toBeGreaterThan(500);
	}, 60_000);

	it("a 30%-opacity rect over text tints it without erasing it", async () => {
		const glyph = (_r: number, g: number) => g > 120;
		const white = { ...ink(0), fillColor: Color.rgba(255, 255, 255) };
		const reference = await renderWide(function* () {
			yield* Scene.instantiate("Text", white);
			yield* Scene.tick;
		});
		const card = { ...backdrop, fillColor: Color.rgba(255, 0, 0) };
		// the card both before (behind by paint order) and after (in front)
		// the text: neither may punch a hole in the glyphs
		for (const cardFirst of [true, false]) {
			const tinted = await renderWide(function* () {
				if (cardFirst) {
					yield* Scene.instantiate("Rect", { ...card, opacity: 0.3 });
				}
				yield* Scene.instantiate("Text", white);
				if (!cardFirst) {
					yield* Scene.instantiate("Rect", { ...card, opacity: 0.3 });
				}
				yield* Scene.tick;
			});
			const expected = countInBackdrop(reference, glyph);
			expect(expected).toBeGreaterThan(500);
			expect(countInBackdrop(tinted, glyph)).toBeGreaterThan(expected * 0.9);
		}
	}, 60_000);

	it("a Scene.play comp renders an Image and a custom-font Text", async () => {
		// comps share the root's font/image actors — resolveResources fills
		// only the root, so a comp-owned registry would never see its bytes
		const rgba = new Uint8Array(8 * 8 * 4);
		for (let i = 0; i < rgba.length; i += 4) {
			rgba[i + 1] = 255;
			rgba[i + 3] = 255;
		}
		const Dot = Image.Image("dot");
		const Custom = Font.Font("Custom");
		const inner = Scene.make(
			function* () {
				yield* Scene.instantiate("Image", {
					image: yield* Dot,
					position: S.vec3({ x: 60, y: 0 }),
					width: 40,
					height: 40,
				});
				yield* Scene.instantiate("Text", {
					position: S.vec3({ x: -110, y: -10 }),
					text: "Comp",
					fontSize: 32,
					fontFamily: yield* Custom,
					fillColor: Color.rgba(255, 255, 255),
				});
				yield* Scene.tick;
			} as never,
			{ width: 256, height: 96 },
		);
		const frames = await framesOf(function* () {
			const h = yield* Scene.play(inner as never);
			yield* h.finished;
		});
		const frame = frames.at(-1) ?? unreachable();
		const png = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 256, height: 96 }).pipe(
					Effect.flatMap((renderer) =>
						NodeRenderer.renderToPng(renderer, frame),
					),
				),
			).pipe(
				Effect.provide(
					Image.layer(Dot, Effect.succeed(NodeRenderer.encodePng(rgba, 8, 8))),
				),
				Effect.provide(Font.layer(Custom, Font.loadDefaultBytes)),
			) as Effect.Effect<Uint8Array, never, never>,
		);
		const decoded = PNG.sync.read(Buffer.from(png));
		let green = false;
		let white = false;
		for (let i = 0; i < decoded.data.length; i += 4) {
			const r = decoded.data[i] ?? 0;
			const g = decoded.data[i + 1] ?? 0;
			const b = decoded.data[i + 2] ?? 0;
			green ||= g > 200 && r < 60 && b < 60;
			white ||= r > 200 && g > 200 && b > 200;
		}
		expect(green).toBe(true);
		expect(white).toBe(true);
	}, 60_000);
});
