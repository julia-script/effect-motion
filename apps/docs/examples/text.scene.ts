import { Color, Motion, Entities as S, Scene } from "effect-motion";

// Text is a plain-string leaf; alignment and styling stay entity-level.
export const scene = Scene.make(
	function* () {
		const title = yield* Scene.instantiate("Text", { position: S.vec3({ x: 250, y: 150 }), text: "effect-motion with Effect", fontSize: 8, opacity: 0, fillColor: Color.hex("#7f5af0"), textAnchor: "middle", baseline: "middle" });

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
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
