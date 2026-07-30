import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// A scene is a program. Instantiating is instant — no frames pass — and
// time advances only when something closes frames: an animator, a wait,
// or a bare Scene.tick. The timeline still reads top to bottom.
export const scene = Scene.make(
	"hello scene",
	function* () {
		const title = yield* Scene.instantiate("Text", {
			text: "a scene is a program",
			fontSize: 96,
			fillColor: Color.hex("#fffffe"),
			textAnchor: "middle",
			baseline: "middle",
			opacity: 0,
		});

		yield* title.pipe(Motion.fadeTo(1, "800 millis"));
		yield* Motion.wait("600 millis");

		// moving up is one more statement — scene time flows with the code
		yield* title.pipe(Motion.moveTo({ y: 90 }, "700 millis", "easeInOutCubic"));

		const sub = yield* Scene.instantiate("Text", {
			position: Entity.vec3({ y: -60 }),
			text: "time advances only when something animates",
			fontSize: 48,
			fillColor: Color.hex("#94a3b8"),
			textAnchor: "middle",
			baseline: "middle",
			opacity: 0,
		});
		yield* sub.pipe(Motion.fadeTo(1, "800 millis"));
		yield* Motion.wait("1 second");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
