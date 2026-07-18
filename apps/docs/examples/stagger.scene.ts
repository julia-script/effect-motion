import { Schedule } from "effect";
import { Color, Motion, Scene, Shapes } from "effect-motion";

// Scene.stagger is the explicit overlap opt-in: starts are staggered by
// the schedule and the released animations run concurrently
export const scene = Scene.make(function* () {
	const colors = [
		Color.hex("#e53170"),
		Color.hex("#ff8906"),
		Color.hex("#7f5af0"),
		Color.hex("#2cb67d"),
	];
	const dots = [];
	for (const [i, fill] of colors.entries()) {
		dots.push(
			yield* Scene.instantiate(Shapes.Circle, {
				x: 60,
				y: 60 + i * 60,
				radius: 14,
				fill,
			}),
		);
	}

	// first releases immediately, each next 250ms later — all run
	// concurrently once released
	yield* Scene.stagger(
		dots.map((dot) =>
			Motion.tweenTo(dot, { x: 440 }, "1 second", "easeInOutCubic"),
		),
		Schedule.spaced("250 millis"),
	);
});
