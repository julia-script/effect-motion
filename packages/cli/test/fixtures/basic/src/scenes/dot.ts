import { Color, Scene, Shapes } from "effect-motion";

// tiny deterministic scene: 5 frames total (4 ticks + initial)
export const scene = Scene.make(
	function* () {
		yield* Scene.instantiate(Shapes.Circle, {
			x: 60,
			y: 40,
			radius: 12,
			fill: Color.hex("#e53170"),
		});
		for (let i = 0; i < 4; i++) yield* Scene.tick;
	},
	{ width: 120, height: 80 },
);
