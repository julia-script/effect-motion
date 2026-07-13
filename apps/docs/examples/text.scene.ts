import { Motion, Scene, Shapes } from "effect-motion";

// centered on x/y via textAnchor + baseline — the engine can't measure
// text, so alignment is SVG's job. fontSize is a number: tweenable.
export const scene = Scene.make(function* () {
	const title = yield* Scene.instantiate(Shapes.Text, {
		text: "effect-motion",
		x: 250,
		y: 150,
		fontSize: 8,
		opacity: 0,
		fill: "#7f5af0",
		textAnchor: "middle",
		baseline: "middle",
	});

	// fade in while the size pops past its target and springs back
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
