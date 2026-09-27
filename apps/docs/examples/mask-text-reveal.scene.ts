import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

export const scene = Scene.make(
	"mask text reveal",
	function* () {
		const title = yield* Scene.instantiate("Text", {
			text: "REVEAL",
			fontSize: 220,
			fillColor: Color.hex("#f4f0e8"),
			textAnchor: "middle",
			baseline: "middle",
		});
		const wipe = yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ x: -1300 }),
			width: 1300,
			height: 300,
			fillColor: Color.hex("#ff5a1f"),
		});

		yield* Scene.setMask(title, wipe);
		yield* Scene.all([
			Motion.moveTo(wipe, { x: 0 }, "2 seconds", "easeInOutCubic"),
			Motion.fadeTo(title, 0.7, "2 seconds"),
		]);
		yield* Motion.wait("500 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.hex("#16161d") },
);
