import { Schedule } from "effect";
import { Motion, Scene, Shapes } from "effect-motion";

// Scene.chain runs items one at a time — the schedule is consulted when
// an item ENDS, so items never overlap (Effect's own schedule guarantee)
export const scene = Scene.make(function* () {
	const colors = ["#e53170", "#ff8906", "#7f5af0"];
	const dots = [];
	for (const [i, fill] of colors.entries()) {
		dots.push(
			yield* Scene.instantiate(Shapes.Circle, {
				x: 60,
				y: 75 + i * 75,
				radius: 14,
				fill,
			}),
		);
	}

	// each starts 300ms after the previous one FINISHES
	yield* Scene.chain(
		dots.map((dot) =>
			Motion.tweenTo(dot, { x: 440 }, "800 millis", "easeInOutCubic"),
		),
		Schedule.spaced("300 millis"),
	);
});
