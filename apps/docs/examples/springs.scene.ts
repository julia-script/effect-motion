import { Color, Motion, Physics, Entity as S, Scene } from "effect-motion";

// no durations — springs run until they physically settle
export const scene = Scene.make(
	function* () {
		const ball = yield* Scene.instantiate("Circle", {
			position: S.vec3({}),
			radius: 1,
			fillColor: Color.hex("#ff8906"),
		});

		// elastic entrance, then springy travel — one chained motion
		yield* ball.pipe(
			Motion.tweenTo({ radius: 24 }, "700 millis", "easeOutElastic"),
			Physics.springTo({ x: 180 }, "swing"),
			Physics.springTo({ x: -180 }, "bounce"),
			Physics.springTo({ x: 0, y: 80 }, "jump"),
		);
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
