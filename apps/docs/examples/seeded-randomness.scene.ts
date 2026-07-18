import { Random } from "effect";
import { Color, Motion, Scene, Shapes } from "effect-motion";

// effect's Random is seeded per scene: every run of this scene —
// including every replay in this player — is byte-identical
export const scene = Scene.make(function* () {
	const walker = yield* Scene.instantiate(Shapes.Circle, {
		x: 250,
		y: 150,
		radius: 12,
		fill: Color.hex("#7f5af0"),
	});

	for (let i = 0; i < 6; i++) {
		const x = yield* Random.nextBetween(40, 460);
		const y = yield* Random.nextBetween(40, 260);
		yield* walker.pipe(Motion.moveTo({ x, y }, "400 millis", "easeInOutCubic"));
	}
});
