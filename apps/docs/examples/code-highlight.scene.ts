import * as Highlight from "@effect-motion/code/Highlight";
import * as Selection from "@effect-motion/code/Selection";
import { parser } from "@lezer/javascript";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Font from "effect-motion/Font";
import * as Motion from "effect-motion/Motion";
import * as Resource from "effect-motion/Resource";
import * as Scene from "effect-motion/Scene";

// Syntax highlighting is authoring-time: Lezer tokenizes the snippet ONCE,
// outside the scene body, into plain span data on a single Text. The
// selection sweep is `Selection.selectTo` — everything outside the selected
// range dims toward the backdrop, colors interpolating frame-exactly.

const JetBrainsMono = Font.Font("JetBrains Mono");

const CODE = `const scene = Scene.make(function* () {
  const dot = yield* Scene.instantiate("Circle", {
    radius: 40,
  });
  yield* Motion.moveTo(dot, { x: 300 }, "1 second");
});`;

const BACKGROUND = Color.rgba(22, 22, 29);
const INK = Color.hex("#dcdce6");

const snippet = Highlight.highlight(CODE, parser, Highlight.defaultTheme);

// select whole statements by their source text — plain string math
const lineOf = (needle: string): Selection.Range => {
	const from = CODE.indexOf(needle);
	return { from, to: from + needle.length };
};
const instantiateCall = lineOf(`Scene.instantiate("Circle", {
    radius: 40,
  })`);
const moveToCall = lineOf(`Motion.moveTo(dot, { x: 300 }, "1 second")`);

export const scene = Scene.make(
	"code highlight",
	function* () {
		const mono = yield* JetBrainsMono;
		const code = yield* Scene.instantiate("Text", {
			position: Entity.vec3({ x: -840, y: 300 }),
			text: snippet.text,
			spans: snippet.spans,
			fontSize: 56,
			fontFamily: mono,
			fillColor: INK,
			baseline: "hanging",
		});

		const sweep = (ranges: ReadonlyArray<Selection.Range>) =>
			Selection.selectTo(code, snippet, ranges, {
				duration: "600 millis",
				timing: "easeInOutCubic",
				background: BACKGROUND,
				baseColor: INK,
			});

		yield* Motion.wait("1 second");
		yield* sweep([instantiateCall]);
		yield* Motion.wait("1200 millis");
		yield* sweep([moveToCall]);
		yield* Motion.wait("1200 millis");
		// selecting everything restores the full highlight
		yield* sweep([{ from: 0, to: CODE.length }]);
		yield* Motion.wait("1 second");
	},
	{ width: 1920, height: 1080, backgroundColor: BACKGROUND },
);

export const renderLayers = Font.layer(
	JetBrainsMono,
	Resource.fetchBytes(
		"https://cdn.jsdelivr.net/npm/@expo-google-fonts/jetbrains-mono@0.2.3/JetBrainsMono_400Regular.ttf",
	),
);
