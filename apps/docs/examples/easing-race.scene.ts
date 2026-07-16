import { Motion, Scene, Shapes } from "effect-motion";

// same distance, same duration — only the pacing differs
export const scene = Scene.make(function* () {
	const linear = yield* Scene.instantiate(Shapes.Circle, {
		x: 40,
		y: 70,
		radius: 14,
		fill: "#7f5af0",
	});
	const cubic = yield* Scene.instantiate(Shapes.Circle, {
		x: 40,
		y: 150,
		radius: 14,
		fill: "#2cb67d",
	});
	const expo = yield* Scene.instantiate(Shapes.Circle, {
		x: 40,
		y: 230,
		radius: 14,
		fill: "tomato",
	});

	yield* Scene.all([
		Motion.tweenTo(linear, { x: 460 }, "2 seconds"),
		Motion.tweenTo(cubic, { x: 460 }, "2 seconds", "easeInOutCubic"),
		Motion.tweenTo(expo, { x: 460 }, "2 seconds", "easeOutExpo"),
	]);
});
