import { Motion, Scene, Shapes } from "effect-motion";

// The camera is an ordinary instance: pan it with the same animators as
// anything else. Each top-level Group carries a `depth` — the fraction of
// the camera it feels. Far layers (small depth) drift slowly, the near layer
// moves fully, and a `depth: 0` layer is pinned to the screen as a HUD.
export const scene = Scene.make(function* () {
	// far background: three dim stars, barely moves (depth 0.2)
	yield* Scene.instantiate(Shapes.Group, {
		depth: 0.2,
		children: [
			Scene.instantiate(Shapes.Circle, {
				x: 60,
				y: 60,
				radius: 3,
				fill: "#544f80",
			}),
			Scene.instantiate(Shapes.Circle, {
				x: 220,
				y: 40,
				radius: 2,
				fill: "#544f80",
			}),
			Scene.instantiate(Shapes.Circle, {
				x: 400,
				y: 80,
				radius: 3,
				fill: "#544f80",
			}),
		],
	});

	// mid layer: moves at half the camera (depth 0.5)
	yield* Scene.instantiate(Shapes.Group, {
		depth: 0.5,
		children: [
			Scene.instantiate(Shapes.Square, {
				x: 120,
				y: 150,
				size: 40,
				fill: "#a786df",
			}),
			Scene.instantiate(Shapes.Square, {
				x: 300,
				y: 130,
				size: 32,
				fill: "#a786df",
			}),
		],
	});

	// near foreground: full camera (depth 1, the default)
	yield* Scene.instantiate(Shapes.Group, {
		children: [
			Scene.instantiate(Shapes.Circle, {
				x: 100,
				y: 240,
				radius: 22,
				fill: "#e53170",
			}),
			Scene.instantiate(Shapes.Circle, {
				x: 280,
				y: 250,
				radius: 18,
				fill: "#ff8906",
			}),
		],
	});

	// HUD: depth 0 pins it to the screen — the camera never touches it
	yield* Scene.instantiate(Shapes.Group, {
		depth: 0,
		children: [
			Scene.instantiate(Shapes.Rect, {
				x: 16,
				y: 16,
				width: 90,
				height: 20,
				fill: "#0f0e17",
				stroke: "#fffffe",
				strokeWidth: 1,
			}),
		],
	});

	// pan the camera right and back; layers separate by their depth
	const cam = yield* Scene.camera;
	yield* cam.pipe(
		Motion.moveTo({ x: 200 }, "2 seconds", "easeInOutCubic"),
		Motion.moveTo({ x: 0 }, "2 seconds", "easeInOutCubic"),
	);
});
