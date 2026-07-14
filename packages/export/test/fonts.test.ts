import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import * as Stream from "effect/Stream";
import { Fonts as MotionFonts, Scene, Shapes, Svg } from "effect-motion";
import { expect, it } from "vitest";
import { Fonts, Resvg } from "../src";

// a real TTF the workspace already carries (next's compiled @vercel/og);
// the e2e test skips if the docs app ever drops next
const geist = fileURLToPath(
	new URL(
		"../../../apps/docs/node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
		import.meta.url,
	),
);

const textScene = () =>
	Scene.make(function* () {
		yield* Scene.instantiate(Shapes.Text, {
			text: "Hello fonts",
			x: 40,
			y: 80,
			fontSize: 40,
			fontFamily: "Geist",
			fill: "#f8fafc",
		});
		yield* Scene.tick;
	});

const layers = Svg.layer.pipe(Layer.provideMerge(Svg.shapesLayer));

const svgOf = (scene: unknown) =>
	Effect.runPromise(
		Effect.gen(function* () {
			const head = yield* Scene.stream(scene as never).pipe(Stream.runHead);
			if (head._tag !== "Some") throw new Error("no frames");
			const renderer = yield* Svg.SvgRenderer.Context;
			return yield* renderer.render(head.value as never, {});
		}).pipe(Effect.provide(layers)) as Effect.Effect<string>,
	);

it("path entries become fontFiles; url-only entries are skipped", () => {
	const scene = textScene().annotate(MotionFonts.Fonts, [
		{ family: "Geist", src: { path: "./fonts/Geist.ttf" } },
		{ family: "Inter", src: { url: "/fonts/inter.woff2" } },
	]);
	expect(Fonts.resvgOptions(scene)).toEqual({
		font: { fontFiles: ["./fonts/Geist.ttf"] },
	});
});

it("url-only declarations map to no font options", () => {
	const scene = textScene().annotate(MotionFonts.Fonts, [
		{ family: "Inter", src: { url: "/fonts/inter.woff2" } },
	]);
	expect(Fonts.resvgOptions(scene)).toEqual({});
	expect(Fonts.resvgOptions(textScene())).toEqual({});
});

it.skipIf(!existsSync(geist))(
	"declared font files reach resvg: the declared family renders",
	async () => {
		const scene = textScene().annotate(MotionFonts.Fonts, [
			{ family: "Geist", src: { path: geist } },
		]);
		const svg = await svgOf(scene);
		// loadSystemFonts: false isolates the comparison — with the declared
		// file the text draws in Geist, without it resvg has no font at all
		const [withFont, withoutFont] = await Promise.all([
			Effect.runPromise(
				Resvg.rasterize(svg, {
					...Fonts.resvgOptions(scene),
					font: { ...Fonts.resvgOptions(scene).font, loadSystemFonts: false },
				}),
			),
			Effect.runPromise(
				Resvg.rasterize(svg, { font: { loadSystemFonts: false } }),
			),
		]);
		expect(Buffer.from(withFont).equals(Buffer.from(withoutFont))).toBe(false);
	},
);
