import { Color, Motion, Scene, Shapes } from "effect-motion";

// A scene is a generator: instantiate entities, then yield animations.
// Preview it with `motion studio`, render it with `motion render`.
export const scene = Scene.make(function* () {
	const circle = yield* Scene.instantiate(Shapes.Circle, {
		x: 300,
		y: 540,
		radius: 80,
		fill: Color.hex("#7f5af0"),
	});

	yield* Motion.tweenTo(circle, { x: 1620 }, "1200 millis", "easeInOutCubic");
	yield* Motion.fadeTo(circle, 0, "400 millis");
});
