import { Color, Motion, Particles, Scene, Shapes } from "effect-motion";

// Parallax falls out of perspective for free: give objects a world `z` and a
// panning camera separates them by depth automatically — far things drift
// slower than near things, no dedicated parallax primitive needed. Here a far
// starfield, a mid band of squares, and a near pair of circles sit at three
// depths; the camera pans and they part.
export const scene = Scene.make(function* () {
	// far starfield, pushed deep in z so it barely moves as the camera pans
	const stars = yield* Particles.field({
		region: { w: 500, h: 300 },
		drift: [1, 4],
		size: [0.6, 1.8],
		opacityRange: [0.3, 0.9],
		palette: [Color.hex("#fffffe"), Color.hex("#b8c1ec"), Color.hex("#8087b3")],
		capacity: 90,
	});
	yield* Scene.instantiate(Shapes.Group, { z: -1600, children: [stars] });
	yield* Scene.background(
		Particles.simulate(stars, "10 seconds", { fill: 90 }),
	);

	// mid band: halfway back
	yield* Scene.instantiate(Shapes.Group, {
		z: -600,
		children: [
			Scene.instantiate(Shapes.Square, {
				x: 120,
				y: 150,
				size: 40,
				fill: Color.hex("#a786df"),
			}),
			Scene.instantiate(Shapes.Square, {
				x: 300,
				y: 130,
				size: 32,
				fill: Color.hex("#a786df"),
			}),
		],
	});

	// near foreground: on the z=0 plane, tracks the camera fully
	yield* Scene.instantiate(Shapes.Circle, {
		x: 100,
		y: 240,
		radius: 22,
		fill: Color.hex("#e53170"),
	});
	yield* Scene.instantiate(Shapes.Circle, {
		x: 280,
		y: 250,
		radius: 18,
		fill: Color.hex("#ff8906"),
	});

	// pan the camera right and back; depth separates the layers
	const cam = yield* Scene.camera;
	yield* cam.pipe(
		Motion.moveTo({ x: 200 }, "2 seconds", "easeInOutCubic"),
		Motion.moveTo({ x: 0 }, "2 seconds", "easeInOutCubic"),
	);
});
