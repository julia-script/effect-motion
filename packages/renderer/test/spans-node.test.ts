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

// Text spans on the headless path: per-range colored glyphs in ONE mesh.
// Layout assertions are exact (positions are deterministic); pixel
// assertions are channel statistics, never byte equality.

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

const withProbeFont = async <A>(
	use: (actor: Text.Text) => Promise<A>,
): Promise<A> => {
	const actor = Text.make();
	await Effect.runPromise(
		Effect.flatMap(Font.loadDefaultBytes, (bytes) =>
			Text.registerFont(actor, "probe", bytes),
		) as Effect.Effect<void, never, never>,
	);
	try {
		return await use(actor);
	} finally {
		Text.dispose(actor);
	}
};

describe("Text spans, layout", () => {
	it("spans change style keys, never glyph positions", async () => {
		await withProbeFont(async (actor) => {
			const request = {
				text: "const x",
				fontId: "probe",
				fontSize: 32,
			};
			const plain = await Effect.runPromise(
				Text.layout(actor, request) as Effect.Effect<
					LayoutResult,
					never,
					never
				>,
			);
			const spanned = await Effect.runPromise(
				Text.layout(actor, {
					...request,
					spans: [
						{ from: 0, to: 5 },
						{ from: 6, to: 7 },
					],
				}) as Effect.Effect<LayoutResult, never, never>,
			);
			expect(spanned.glyphs.length).toBe(plain.glyphs.length);
			for (const [index, glyph] of spanned.glyphs.entries()) {
				const reference = plain.glyphs[index] ?? unreachable();
				expect(glyph.x).toBeCloseTo(reference.x, 5);
				expect(glyph.y).toBeCloseTo(reference.y, 5);
			}
			// `const` carries the first span's key, the space stays base
			const first = spanned.glyphs[0] ?? unreachable();
			expect(first.styleKey).toBe("s0");
			const space = spanned.glyphs.find((glyph) => glyph.start === 5);
			expect(space?.styleKey ?? "fill").toBe("fill");
			const last = spanned.glyphs.at(-1) ?? unreachable();
			expect(last.styleKey).toBe("s1");
		});
	}, 60_000);

	it("ligatures form within a span and never across a boundary", async () => {
		await withProbeFont(async (actor) => {
			const layoutOf = (
				spans?: ReadonlyArray<{ readonly from: number; readonly to: number }>,
			) =>
				Effect.runPromise(
					Text.layout(actor, {
						text: "=>",
						fontId: "probe",
						fontSize: 32,
						...(spans === undefined ? {} : { spans }),
					}) as Effect.Effect<LayoutResult, never, never>,
				);
			// Inter substitutes `=>` with a single arrow glyph
			const plain = await layoutOf();
			expect(plain.glyphs.length).toBe(1);
			// one span covering the whole pair: still one glyph
			const covered = await layoutOf([{ from: 0, to: 2 }]);
			expect(covered.glyphs.length).toBe(1);
			// a boundary through the pair splits shaping: two glyphs
			const split = await layoutOf([{ from: 0, to: 1 }]);
			expect(split.glyphs.length).toBe(2);
		});
	}, 60_000);
});

describe("Text spans, headless GPU", () => {
	const countDominant = (png: PNG): { red: number; green: number } => {
		let red = 0;
		let green = 0;
		for (let i = 0; i < png.data.length; i += 4) {
			const r = png.data[i] ?? 0;
			const g = png.data[i + 1] ?? 0;
			if (r > 120 && g < 80) {
				red += 1;
			}
			if (g > 120 && r < 80) {
				green += 1;
			}
		}
		return { red, green };
	};

	const spannedFrame = (spanColor: Color.Color) =>
		framesOf(function* () {
			yield* Scene.instantiate("Text", {
				position: S.vec3({ x: -60, y: -12 }),
				text: "RG",
				fontSize: 48,
				fillColor: Color.rgba(0, 255, 0),
				spans: [S.Span.make({ from: 0, to: 1, fillColor: spanColor })],
			});
			yield* Scene.tick;
		}).then((frames) => frames.at(-1) ?? unreachable());

	it("a spanned string renders per-range colors from one entity", async () => {
		const frame = await spannedFrame(Color.rgba(255, 0, 0));
		const png = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 256, height: 96 }).pipe(
					Effect.flatMap((renderer) =>
						NodeRenderer.renderToPng(renderer, frame),
					),
				),
			) as Effect.Effect<Uint8Array, never, never>,
		).then((bytes) => PNG.sync.read(Buffer.from(bytes)));
		const { red, green } = countDominant(png);
		// the R paints in the span's red, the G in the entity's green
		expect(red).toBeGreaterThan(20);
		expect(green).toBeGreaterThan(20);
	}, 60_000);

	it("a color-only span change recolors on the retained mesh", async () => {
		// identical structure, different span color — same instance ids, so
		// the second render exercises the retained UPDATE path (colorKey
		// changes, layout key does not)
		const first = await spannedFrame(Color.rgba(255, 0, 0));
		const second = await spannedFrame(Color.rgba(0, 255, 0));
		const [before, after] = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 256, height: 96 }).pipe(
					Effect.flatMap((renderer) =>
						Effect.flatMap(
							NodeRenderer.renderToPng(renderer, first),
							(beforeBytes) =>
								Effect.map(
									NodeRenderer.renderToPng(renderer, second),
									(afterBytes) => [beforeBytes, afterBytes] as const,
								),
						),
					),
				),
			) as Effect.Effect<readonly [Uint8Array, Uint8Array], never, never>,
		).then(
			([a, b]) =>
				[PNG.sync.read(Buffer.from(a)), PNG.sync.read(Buffer.from(b))] as const,
		);
		expect(countDominant(before).red).toBeGreaterThan(20);
		// after the recolor the R glyph is green like the rest — no red left
		expect(countDominant(after).red).toBe(0);
		expect(countDominant(after).green).toBeGreaterThan(
			countDominant(before).green,
		);
	}, 60_000);
});
