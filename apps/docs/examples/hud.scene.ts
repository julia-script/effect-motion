import { Color, Motion, Physics, Entity as S, Scene } from "effect-motion";

// A Hud's subtree is projected through the IDENTITY camera: while the real
// camera dollies and shakes through the world, HUD content stays bolted to
// the glass — and a lower-third slides in with one tween on the container.
export const scene = Scene.make(
	function* () {
		// world content at three depths
		yield* Scene.instantiate("Rect", {
			position: S.vec3({ x: 60, y: 90, z: -400 }),
			width: 120,
			height: 120,
			fillColor: Color.hex("#3b3a5a"),
		});
		yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 250, y: 160 }),
			radius: 45,
			fillColor: Color.hex("#2cb67d"),
		});
		yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 380, y: 120, z: 200 }),
			radius: 30,
			fillColor: Color.hex("#7f5af0"),
		});

		// HUD: a fixed title, and a lower-third parked off-screen below
		yield* Scene.instantiate("Hud", {
			children: [
				Scene.instantiate("Text", {
					text: "LIVE",
					position: S.vec3({ x: 460, y: 30 }),
					fontSize: 18,
					fillColor: Color.hex("#ff5470"),
				}),
			],
		});
		const lowerThird = yield* Scene.instantiate("Hud", {
			position: S.vec3({ y: 90 }), // parked below the frame; slides up to 0
			children: [
				Scene.instantiate("Rect", {
					position: S.vec3({ x: 20, y: 240 }),
					width: 280,
					height: 40,
					fillColor: Color.hex("#16161d"),
					strokeColor: Color.hex("#7f5af0"),
					strokeWidth: 2,
				}),
				Scene.instantiate("Text", {
					text: "HUD content ignores the camera",
					position: S.vec3({ x: 34, y: 265 }),
					fontSize: 14,
					fillColor: Color.hex("#fffffe"),
				}),
			],
		});

		const camera = yield* Scene.camera;

		// slide the lower-third in while the camera is already moving
		yield* Scene.all([
			Motion.moveTo(lowerThird, { y: 0 }, "700 millis", "easeInOutCubic"),
			Motion.moveTo(camera, { z: -300 }, "1200 millis", "easeInOutCubic"),
		]);
		// impact shake (the camera-shake idiom): jolt, then an under-damped
		// spring rings the WORLD back — the HUD never moves
		yield* Scene.update(camera, (d) => ({
			...d,
			position: S.vec3({ ...d.position, x: 22, y: 8 }),
		}));
		yield* camera.pipe(
			Physics.springTo(
				{ x: 0, y: 0 },
				{ mass: 0.1, stiffness: 34, damping: 0.35 },
			),
		);
		yield* Motion.wait("600 millis");
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
