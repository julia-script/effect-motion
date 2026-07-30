import { Random } from "effect";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// Effect's Random is seeded per scene: every run of this walk — including
// every replay in this player — visits exactly the same points. Change the
// scene's `seed` setting and you get a different (equally repeatable) walk.
export const scene = Scene.make(
	"seeded walk",
	function* () {
		const walker = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({}),
			radius: 40,
			fillColor: Color.hex("#7f5af0"),
		});

		for (let i = 0; i < 6; i++) {
			const x = yield* Random.nextBetween(-780, 780);
			const y = yield* Random.nextBetween(-380, 380);
			// a fading breadcrumb marks each visited point
			const crumb = yield* Scene.instantiate("Circle", {
				position: Entity.vec3({ x, y }),
				radius: 12,
				fillColor: Color.hex("#2cb67d"),
				opacity: 0,
			});
			yield* Scene.all([
				Motion.moveTo(walker, { x, y }, "500 millis", "easeInOutCubic"),
				Motion.fadeTo(crumb, 0.6, "500 millis"),
			]);
		}
		yield* Motion.wait("600 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
