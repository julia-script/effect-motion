import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { Color, Entity as S, Scene } from "effect-motion";
import * as Font from "effect-motion/Font";
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

	it("multi-line quads stack downward in y-up mesh space (no double flip)", async () => {
		// asymmetric two-line layout: line 2 must sit BELOW line 1, which in
		// the y-up quad frame means strictly smaller y — a stray extra flip at
		// the font-metric boundary would invert this and cannot cancel out
		const actor = Text.make();
		Text.registerFont(
			actor,
			"probe",
			await Effect.runPromise(Font.loadDefaultBytes),
		);
		const quads = await Effect.runPromise(
			Text.layout(actor, {
				text: "WIDE FIRST LINE\nx",
				fontId: "probe",
				fontSize: 32,
			}) as Effect.Effect<Text.GlyphQuads, never, never>,
		);
		expect(quads.count).toBeGreaterThan(2);
		// last glyph ("x", line 2) tops out below the first glyph's top
		const firstTop = quads.bounds[3] ?? unreachable();
		const lastTop = quads.bounds[(quads.count - 1) * 4 + 3] ?? unreachable();
		expect(lastTop).toBeLessThan(firstTop);
		// default anchor: baseline-left of line 1 at (0, 0) → line-1 glyph
		// tops are above the baseline (positive y)
		expect(firstTop).toBeGreaterThan(0);
	}, 60_000);
});
