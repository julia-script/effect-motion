import { readFile } from "node:fs/promises";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Color, Entity as S, Scene } from "effect-motion";
import * as Font from "effect-motion/Font";
import * as Image from "effect-motion/Image";

// a scene needing a custom font AND an image: frames/sheets must hand the
// studio's layers to the GPU renderer, not only to the sampler
export const Brand = Font.Font("Fixture Sans");
export const Dot = Image.Image("fixture-dot");

export const layers = Layer.mergeAll(
	// the bundled font's bytes under a custom family id: exercises the
	// custom-loader path without shipping a font file
	Font.layer(Brand, Font.loadDefaultBytes),
	Image.layer(
		Dot,
		Effect.tryPromise(
			async () =>
				new Uint8Array(
					await readFile(new URL("../../assets/dot.png", import.meta.url)),
				),
		),
	),
);

// 5 frames (4 ticks + initial), like dot
export const scene = Scene.make(
	function* () {
		yield* Scene.instantiate("Image", {
			image: yield* Dot,
			position: S.vec3({ x: -30, y: 0 }),
			width: 30,
			height: 30,
		});
		yield* Scene.instantiate("Text", {
			position: S.vec3({ x: 20, y: 0 }),
			text: "Hi",
			fontSize: 24,
			fontFamily: yield* Brand,
			fillColor: Color.hex("#ffffff"),
		});
		for (let i = 0; i < 4; i++) yield* Scene.tick;
	},
	{ width: 120, height: 80 },
);
