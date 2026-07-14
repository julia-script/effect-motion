import { Motion, Particles, Scene, Shapes } from "effect-motion";

// The camera is an ordinary instance: pan it with the same animators as
// anything else. Each top-level Group carries a `depth` — the fraction of
// the camera it feels. A far starfield barely moves, a mid layer drifts at
// half speed, the near shapes track the camera fully, and a depth:0 HUD is
// pinned to the screen.
export const scene = Scene.make(function* () {
	// far layer: a drifting starfield. It sits in a depth:0.2 group, so the
	// whole field parallaxes slowly while its own particles twinkle-drift.
	const stars = yield* Particles.field({
		region: { w: 500, h: 300 },
		drift: [1, 4],
		size: [0.6, 1.8],
		opacityRange: [0.3, 0.9],
		palette: ["#fffffe", "#b8c1ec", "#8087b3"],
		capacity: 90,
	});
	yield* Scene.instantiate(Shapes.Group, {
		depth: 0.2,
		children: [stars],
	});
	// keep the field alive for the whole shot, alongside the camera move
	yield* Scene.background(
		Particles.simulate(stars, "10 seconds", { fill: 90 }),
	);

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

	// HUD: depth:0 pins it to the screen. A thin outlined pill reads as an
	// intentional overlay, not a hole punched in the scene.
	yield* Scene.instantiate(Shapes.Group, {
		depth: 0,
		children: [
			Scene.instantiate(Shapes.Rect, {
				x: 20,
				y: 20,
				width: 88,
				height: 8,
				fill: "#2cb67d",
			}),
			Scene.instantiate(Shapes.Rect, {
				x: 20,
				y: 20,
				width: 120,
				height: 8,
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
