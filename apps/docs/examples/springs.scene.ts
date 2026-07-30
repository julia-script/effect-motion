import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Physics from "effect-motion/Physics";
import * as Scene from "effect-motion/Scene";

// No durations anywhere — each leg runs until the simulation physically
// settles, and the settling time falls out of mass/stiffness/damping.
export const scene = Scene.make(
	"springs",
	function* () {
		const ball = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({}),
			radius: 4,
			fillColor: Color.hex("#ff8906"),
		});

		// elastic entrance (an easing, fixed duration), then springy travel
		// (physics, duration emerges) — one chained motion
		yield* ball.pipe(
			Motion.tweenTo({ radius: 80 }, "700 millis", "easeOutElastic"),
			Physics.springTo({ x: 620 }, "swing"),
			Physics.springTo({ x: -620 }, "bounce"),
			Physics.springTo({ x: 0, y: 260 }, "jump"),
			Physics.springTo({ y: 0 }, { mass: 0.4, stiffness: 120, damping: 4 }),
		);
		yield* Motion.wait("400 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
