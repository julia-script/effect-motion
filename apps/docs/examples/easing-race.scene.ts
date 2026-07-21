import { Color, Motion, Entities as S, Scene } from "effect-motion";

// same distance, same duration — only the pacing differs
export const scene = Scene.make(
	function* () {
		const linear = yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 40, y: 70 }),
			radius: 14,
			fillColor: Color.hex("#7f5af0"),
		});
		const cubic = yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 40, y: 150 }),
			radius: 14,
			fillColor: Color.hex("#2cb67d"),
		});
		const expo = yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 40, y: 230 }),
			radius: 14,
			fillColor: Color.hex("tomato"),
		});

		yield* Scene.all([
			Motion.moveTo(linear, { x: 460 }, "2 seconds"),
			Motion.moveTo(cubic, { x: 460 }, "2 seconds", "easeInOutCubic"),
			Motion.moveTo(expo, { x: 460 }, "2 seconds", "easeOutExpo"),
		]);
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
