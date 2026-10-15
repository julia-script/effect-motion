import * as Code from "@effect-motion/code/Code";
import * as Highlight from "@effect-motion/code/Highlight";
import { parser } from "@lezer/javascript";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Font from "effect-motion/Font";
import * as Motion from "effect-motion/Motion";
import * as Resource from "effect-motion/Resource";
import * as Scene from "effect-motion/Scene";

// A code block that EVOLVES: pass the whole new source and a deterministic
// diff plans the transition — unchanged tokens slide (across lines too),
// removals fade out, insertions fade in. The block is an ordinary Group of
// Texts on a monospace grid, so standard animators drive everything.

const JetBrainsMono = Font.Font("JetBrains Mono");

const V1 = `function total(items) {
  return items
    .map((item) => item.price)
    .reduce((sum, price) => sum + price, 0);
}`;

const V2 = `function total(items, taxRate) {
  const subtotal = items
    .map((item) => item.price)
    .reduce((sum, price) => sum + price, 0);
  return subtotal * (1 + taxRate);
}`;

const V3 = `function total(items, taxRate) {
  const prices = items.map((item) => item.price);
  const subtotal = prices.reduce((sum, price) => sum + price, 0);
  return subtotal * (1 + taxRate);
}`;

const BACKGROUND = Color.rgba(22, 22, 29);
const INK = Color.hex("#dcdce6");

export const scene = Scene.make(
	"code edit",
	function* () {
		const mono = yield* JetBrainsMono;
		const block = yield* Code.block({
			code: V1,
			parser,
			theme: Highlight.defaultTheme,
			fontSize: 44,
			// JetBrains Mono's real metrics — or derive with Metrics.gridFromFont
			grid: { charWidth: 0.6, lineHeight: 1.32 },
			fontFamily: mono,
			fillColor: INK,
			position: Entity.vec3({ x: -860, y: 240 }),
		});

		yield* Motion.wait("1 second");
		// add a parameter and capture the intermediate value
		yield* Code.editTo(block, V2, {
			duration: "900 millis",
			timing: "easeInOutCubic",
		});
		yield* Motion.wait("1400 millis");
		// spotlight what the next edit will touch
		yield* Code.selectTo(
			block,
			[{ from: V2.indexOf("const subtotal"), to: V2.indexOf("\n  return") }],
			{ duration: "500 millis", background: BACKGROUND },
		);
		yield* Motion.wait("1 second");
		yield* Code.selectTo(block, [{ from: 0, to: V2.length }], {
			duration: "400 millis",
			background: BACKGROUND,
		});
		yield* Motion.wait("400 millis");
		// extract the mapped prices — watch the chain migrate across lines
		yield* Code.editTo(block, V3, {
			duration: "900 millis",
			timing: "easeInOutCubic",
		});
		yield* Motion.wait("1600 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: BACKGROUND },
);

export const renderLayers = Font.layer(
	JetBrainsMono,
	Resource.fetchBytes(
		"https://cdn.jsdelivr.net/npm/@expo-google-fonts/jetbrains-mono@0.2.3/JetBrainsMono_400Regular.ttf",
	),
);
