import { Schedule } from "effect";
import { Motion, Scene, Shapes } from "effect-motion";

// Scene.all with a schedule staggers each start by 250ms of scene time
export const scene = Scene.make(function* () {
	const colors = ["#e53170", "#ff8906", "#7f5af0", "#2cb67d"];
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
	yield* Scene.all(
		dots.map((dot) =>
			Motion.tweenTo(dot, { x: 440 }, "1 second", "easeInOutCubic"),
		),
		{ schedule: Schedule.spaced("250 millis") },
	);
});
