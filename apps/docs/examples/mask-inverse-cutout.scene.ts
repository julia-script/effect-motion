import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

export const scene = Scene.make(
	"mask inverse cutout",
	function* () {
		const card = yield* Scene.instantiate("Group", {
			children: [
				Scene.instantiate("Rect", {
					width: 1150,
					height: 440,
					fillColor: Color.hex("#7f5af0"),
				}),
				Scene.instantiate("Text", {
					text: "CUT OUT",
					fontSize: 150,
					fillColor: Color.hex("#f4f0e8"),
					textAnchor: "middle",
					baseline: "middle",
				}),
			],
		});
		const hole = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: -580 }),
			radius: 170,
			fillColor: Color.hex("#ff5a1f"),
		});

		yield* Scene.setMask(card, hole, { mode: "inverse" });
		yield* Motion.moveTo(hole, { x: 580 }, "2 seconds", "easeInOutCubic");
		yield* Motion.wait("500 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.hex("#16161d") },
);
