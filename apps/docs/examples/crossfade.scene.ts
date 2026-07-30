import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// A movie is a scene that plays other scenes. Scene A declares itself
// finished when its crossing is done — the fade-out afterwards is a TAIL:
// it keeps playing, but nothing waits for it, so B's entrance overlaps it.
const sceneA = Scene.make(
	"scene A",
	function* () {
		const c = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: -700, y: 140 }),
			radius: 60,
			fillColor: Color.hex("#e53170"),
		});
		yield* Motion.moveTo(c, { x: 700 }, "1 second", "easeInOutCubic");
		yield* Scene.finish;
		yield* Motion.fadeTo(c, 0, "1 second");
	},
	{ width: 1920, height: 1080 },
);

const sceneB = Scene.make(
	"scene B",
	function* () {
		const c = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: -700, y: -140 }),
			radius: 60,
			fillColor: Color.hex("#2cb67d"),
		});
		yield* Motion.fade(c, 0, 1, "600 millis");
		yield* Motion.moveTo(c, { x: 700 }, "1 second", "easeInOutCubic");
	},
	{ width: 1920, height: 1080 },
);

// the movie owns the transition: B starts the moment A FINISHES, while A's
// fade-out tail keeps playing over B's entrance
export const scene = Scene.make(
	"crossfade",
	function* () {
		const a = yield* Scene.play(sceneA);
		yield* a.finished;
		const b = yield* Scene.play(sceneB);
		yield* b.finished;
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
