import { Schedule } from "effect";
import { Motion, Scene, Shapes } from "effect-motion";

// Scene.repeat re-runs a motion on a schedule, in scene time: the first
// run is immediate, the schedule paces the gaps after each run
export const scene = Scene.make(function* () {
	const ball = yield* Scene.instantiate(Shapes.Circle, {
		x: 70,
		y: 150,
		radius: 16,
		fill: "#7f5af0",
	});

	// three round-trips, resting 400ms between them
	yield* Scene.repeat(
		ball.pipe(
			Motion.moveTo({ x: 430 }, "600 millis", "easeInOutCubic"),
			Motion.moveTo({ x: 70 }, "600 millis", "easeInOutCubic"),
		),
		Schedule.both(Schedule.spaced("400 millis"), Schedule.recurs(2)),
	);
});
