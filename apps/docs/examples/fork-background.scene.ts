import { Effect, Schedule } from "effect";
import { Motion, Scene, Shapes } from "effect-motion";

// background: loops for the scene's duration and is interrupted at the
// end. fork: overlapping spawns whose last survivor defines the end.
export const scene = Scene.make(function* () {
	const pulse = yield* Scene.instantiate(Shapes.Circle, {
		x: 250,
		y: 70,
		radius: 10,
		fill: "#2cb67d",
	});
	yield* Scene.background(
		Scene.repeat(
			pulse.pipe(
				Motion.tweenTo({ radius: 24 }, "400 millis", "easeInOutCubic"),
				Motion.tweenTo({ radius: 10 }, "400 millis", "easeInOutCubic"),
			),
			Schedule.forever,
		),
	);

	// spawn a drifting dot every 200ms — fork returns immediately, so the
	// runs overlap; the scene ends when the last dot fades
	yield* Scene.repeat(
		Scene.fork(
			Effect.gen(function* () {
				const dot = yield* Scene.instantiate(Shapes.Circle, {
					x: 60,
					y: 210,
					radius: 8,
					fill: "#e53170",
				});
				yield* dot.pipe(
					Motion.tweenTo({ x: 440 }, "1.2 seconds", "easeInOutCubic"),
					Motion.fadeTo(0, "300 millis"),
				);
			}),
		),
		Schedule.fixed("200 millis").pipe(Schedule.upTo({ times: 5 })),
	);
});
