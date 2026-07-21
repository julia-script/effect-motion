import { Color, Motion, Entities as S, Scene } from "effect-motion";

// scene A finishes when its crossing is done — the fade-out afterwards
// is a TAIL: it keeps playing, but nothing waits for it
const sceneA = Scene.make(
	function* () {
		const c = yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 60, y: 110 }),
			radius: 16,
			fillColor: Color.hex("#e53170"),
		});
		yield* Motion.moveTo(c, { x: 440 }, "1 second", "easeInOutCubic");
		yield* Scene.finish;
		yield* Motion.fadeTo(c, 0, "1 second");
	},
	{ width: 500, height: 300 },
);

const sceneB = Scene.make(
	function* () {
		const c = yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 60, y: 190 }),
			radius: 16,
			fillColor: Color.hex("#2cb67d"),
		});
		yield* Motion.fade(c, 0, 1, "600 millis");
		yield* Motion.moveTo(c, { x: 440 }, "1 second", "easeInOutCubic");
	},
	{ width: 500, height: 300 },
);

// the movie owns the transition: B starts the moment A FINISHES, while
// A's fade-out tail keeps playing over B's entrance
export const scene = Scene.make(
	function* () {
		const a = yield* Scene.play(sceneA);
		yield* a.finished;
		const b = yield* Scene.play(sceneB);
		yield* b.finished;
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
