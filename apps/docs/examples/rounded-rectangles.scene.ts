import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

export const scene = Scene.make(
	"From box to pill",
	function* () {
		yield* Scene.instantiate("Text", {
			text: "FROM BOX TO PILL",
			position: Entity.vec3({ y: 170 }),
			textAnchor: "middle",
			fontSize: 30,
			fillColor: Color.hex("#e4edf8"),
		});
		yield* Scene.instantiate("Text", {
			text: "One Rect. Animate width and cornerRadius together.",
			position: Entity.vec3({ y: 125 }),
			textAnchor: "middle",
			fontSize: 18,
			fillColor: Color.hex("#93a4bb"),
		});
		const box = yield* Scene.instantiate("Rect", {
			width: 150,
			height: 150,
			fillColor: Color.hex("#246b69"),
			strokeColor: Color.rgba(115, 255, 215, 0.65),
			strokeWidth: 6,
		});
		const outline = yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ y: -150 }),
			width: 150,
			height: 40,
			fillColor: Color.transparent,
			strokeColor: Color.hex("#f8c773"),
			strokeWidth: 4,
			strokeDasharray: [16, 10],
			trimEnd: 0.75,
		});
		yield* Motion.wait("1 second");
		yield* Scene.all([
			Motion.tweenTo(
				box,
				{ width: 380, height: 110, cornerRadius: 55 },
				"3 seconds",
				"easeInOutCubic",
			),
			outline.pipe(
				Motion.tweenTo(
					{
						width: 380,
						cornerRadius: 20,
						trimOffset: 1,
						strokeDashoffset: -52,
					},
					"3 seconds",
					"linear",
				),
			),
		]);
		yield* Motion.wait("1 second");
	},
	{ width: 800, height: 480, backgroundColor: Color.hex("#111c2e") },
);
