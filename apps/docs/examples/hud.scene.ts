import { Color, Motion, Physics, Scene, Shapes } from "effect-motion";

// A Hud's subtree is projected through the IDENTITY camera: while the real
// camera dollies and shakes through the world, HUD content stays bolted to
// the glass — and a lower-third slides in with one tween on the container.
export const scene = Scene.make(function* () {
	// world content at three depths
	yield* Scene.instantiate(Shapes.Rect, {
		x: 60,
		y: 90,
		z: -400,
		width: 120,
		height: 120,
		fill: Color.hex("#3b3a5a"),
	});
	yield* Scene.instantiate(Shapes.Circle, {
		x: 250,
		y: 160,
		radius: 45,
		fill: Color.hex("#2cb67d"),
	});
	yield* Scene.instantiate(Shapes.Circle, {
		x: 380,
		y: 120,
		z: 200,
		radius: 30,
		fill: Color.hex("#7f5af0"),
	});

	// HUD: a fixed title, and a lower-third parked off-screen below
	yield* Scene.instantiate(Shapes.Hud, {
		children: [
			Scene.instantiate(Shapes.Text, {
				text: "LIVE",
				x: 460,
				y: 30,
				fontSize: 18,
				fill: Color.hex("#ff5470"),
			}),
		],
	});
	const lowerThird = yield* Scene.instantiate(Shapes.Hud, {
		y: 90, // parked below the frame; slides up to 0
		children: [
			Scene.instantiate(Shapes.Rect, {
				x: 20,
				y: 240,
				width: 280,
				height: 40,
				rx: 12,
				fill: Color.hex("#16161d"),
				stroke: Color.hex("#7f5af0"),
				strokeWidth: 2,
			}),
			Scene.instantiate(Shapes.Text, {
				text: "HUD content ignores the camera",
				x: 34,
				y: 265,
				fontSize: 14,
				fill: Color.hex("#fffffe"),
			}),
		],
	});

	const camera = yield* Scene.camera;

	// slide the lower-third in while the camera is already moving
	yield* Scene.all([
		Motion.tweenTo(lowerThird, { y: 0 }, "700 millis", "easeInOutCubic"),
		Motion.moveTo(camera, { z: -300 }, "1200 millis", "easeInOutCubic"),
	]);
	// impact shake (the camera-shake idiom): jolt, then an under-damped
	// spring rings the WORLD back — the HUD never moves
	yield* Scene.update(camera, (d) => ({ ...d, x: 22, y: 8 }));
	yield* camera.pipe(
		Physics.springTo(
			{ x: 0, y: 0 },
			{ mass: 0.1, stiffness: 34, damping: 0.35 },
		),
	);
	yield* Motion.wait("600 millis");
});
