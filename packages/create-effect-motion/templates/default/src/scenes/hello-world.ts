import { Color, Entity, Motion, Scene } from "effect-motion";

// A scene is a generator: instantiate entities, then yield animations.
// The leading string is a DISPLAY name (the studio picker label); the
// studio.ts record key is its identifier. Preview with `motion studio`,
// render with `motion render`.
export const scene = Scene.make("Hello World", function* () {
	const circle = yield* Scene.instantiate("Circle", {
		position: Entity.vec3({ x: -660 }),
		radius: 80,
		fillColor: Color.hex("#7f5af0"),
	});

	yield* Motion.moveTo(circle, { x: 660 }, "1200 millis", "easeInOutCubic");
	yield* Motion.fadeTo(circle, 0, "400 millis");
});
