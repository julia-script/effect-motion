import { Random } from "effect";
import { Color, Motion, Entity as S, Scene } from "effect-motion";

// effect's Random is seeded per scene: every run of this scene —
// including every replay in this player — is byte-identical
export const scene = Scene.make(
	function* () {
		const walker = yield* Scene.instantiate("Circle", {
			position: S.vec3({}),
			radius: 12,
			fillColor: Color.hex("#7f5af0"),
		});

		for (let i = 0; i < 6; i++) {
			const x = yield* Random.nextBetween(-210, 210);
			const y = yield* Random.nextBetween(-110, 110);
			yield* walker.pipe(
				Motion.moveTo({ x, y }, "400 millis", "easeInOutCubic"),
			);
		}
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
