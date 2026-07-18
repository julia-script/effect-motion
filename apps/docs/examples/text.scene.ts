import { Color, Motion, Scene, Shapes } from "effect-motion";

// Text is a plain-string leaf; alignment and styling stay entity-level.
export const scene = Scene.make(function* () {
	const title = yield* Scene.instantiate(Shapes.Text, {
		text: "effect-motion with Effect",
		x: 250,
		y: 150,
		fontSize: 8,
		opacity: 0,
		fill: Color.hex("#7f5af0"),
		textAnchor: "middle",
		baseline: "middle",
	});

	// fontSize is a number, so the Text tweens together.
	yield* Scene.all([
		title.pipe(Motion.fadeTo(1, "400 millis")),
		title.pipe(Motion.tweenTo({ fontSize: 42 }, "700 millis", "easeOutBack")),
	]);

	yield* Motion.wait("400 millis");
	yield* title.pipe(
		Motion.moveTo({ y: 120 }, "500 millis", "easeInOutCubic"),
		Motion.fadeTo(0.35, "500 millis"),
	);
});
