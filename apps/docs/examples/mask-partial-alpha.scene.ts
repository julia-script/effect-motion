import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

export const scene = Scene.make(
	"mask partial alpha",
	function* () {
		const backdrop = yield* Scene.instantiate("Rect", {
			width: 1350,
			height: 560,
			fillColor: Color.hex("#2cb67d"),
		});
		const panel = yield* Scene.instantiate("Rect", {
			width: 1100,
			height: 400,
			fillColor: Color.hex("#f4f0e8"),
			opacity: 0.8,
		});
		const softSource = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: -440 }),
			radius: 240,
			fillColor: Color.hex("#ff5a1f"),
			opacity: 0.45,
		});

		yield* Scene.setMask(panel, softSource);
		yield* Scene.all([
			Motion.moveTo(softSource, { x: 440 }, "2 seconds", "easeInOutCubic"),
			Motion.fadeTo(backdrop, 0.5, "2 seconds"),
		]);
		yield* Motion.wait("500 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.hex("#16161d") },
);
