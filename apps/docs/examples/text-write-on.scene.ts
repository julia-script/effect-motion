import { Schedule } from "effect";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// A title sequence from stacked Text lines: each line is its own instance,
// so the write-on is a stagger of ordinary rise-and-fade motions — and the
// exit is the same stagger, reversed. No text measurement anywhere: lines
// are centered by anchor, spacing is line height.

const LINES: ReadonlyArray<{ text: string; hex: string }> = [
	{ text: "compose", hex: "#94a3b8" },
	{ text: "motion", hex: "#7f5af0" },
	{ text: "with", hex: "#94a3b8" },
	{ text: "Effect", hex: "#2cb67d" },
];
const LINE_H = 190;
const RISE = 70;

export const scene = Scene.make(
	"text write-on",
	function* () {
		const texts = [];
		for (const [i, line] of LINES.entries()) {
			const y = ((LINES.length - 1) / 2 - i) * LINE_H;
			texts.push(
				yield* Scene.instantiate("Text", {
					position: Entity.vec3({ y: y - RISE }),
					text: line.text,
					fontSize: 150,
					fillColor: Color.hex(line.hex),
					textAnchor: "middle",
					baseline: "middle",
					opacity: 0,
				}),
			);
		}

		// write on: rise and fade together, cascading line by line
		yield* Scene.stagger(
			texts.map((t, i) =>
				Scene.all([
					Motion.moveTo(
						t,
						{ y: ((LINES.length - 1) / 2 - i) * LINE_H },
						"600 millis",
						"easeOutCubic",
					),
					Motion.fadeTo(t, 1, "600 millis"),
				]),
			),
			Schedule.spaced("180 millis"),
		);
		yield* Motion.wait("1200 millis");

		// write off: same cascade, upward and out
		yield* Scene.stagger(
			texts.map((t, i) =>
				Scene.all([
					Motion.moveTo(
						t,
						{ y: ((LINES.length - 1) / 2 - i) * LINE_H + RISE },
						"500 millis",
						"easeInCubic",
					),
					Motion.fadeTo(t, 0, "500 millis"),
				]),
			),
			Schedule.spaced("140 millis"),
		);
		yield* Motion.wait("500 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
