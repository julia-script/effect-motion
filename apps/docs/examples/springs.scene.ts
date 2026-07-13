import { Motion, Physics, Scene, Shapes } from "effect-motion";

// no durations — springs run until they physically settle
export const scene = Scene.make(function* () {
	const ball = yield* Scene.instantiate(Shapes.Circle, {
		x: 250,
		y: 150,
		radius: 1,
		fill: "#ff8906",
	});

	// elastic entrance, then springy travel — one chained motion
	yield* ball.pipe(
		Motion.tweenTo({ radius: 24 }, "700 millis", "easeOutElastic"),
		Physics.springTo({ x: 430 }, "swing"),
		Physics.springTo({ x: 70 }, "bounce"),
		Physics.springTo({ x: 250, y: 70 }, "jump"),
	);
});
