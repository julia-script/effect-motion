import { Color, Motion, Runner, Entities as S, Scene } from "effect-motion";

// The 2.5D showcase: objects live at real depths, a tilted Rect lies back as
// a floor, and the free camera dollies forward while orbiting. Render order
// is decided by depth-to-camera, not tree order — the cards re-sort as the
// camera swings around them.
export const scene = Scene.make(
	function* () {
		// a floor: a big Rect tilted back so it recedes toward the horizon
		yield* Scene.instantiate("Rect", { position: S.vec3({ x: -300, y: 180, z: -200 }), rotation: S.vec3({ x: Math.PI / 2.3 }), width: 900, height: 900, fillColor: Color.hex("#232946") });

		// a scatter of cards at varied depths and colours. Same size in world
		// units — perspective makes the near ones large and the far ones small.
		const palette = [
			Color.hex("#e53170"),
			Color.hex("#ff8906"),
			Color.hex("#2cb67d"),
			Color.hex("#7f5af0"),
			Color.hex("#b8c1ec"),
		];
		for (let i = 0; i < 18; i++) {
			const col = i % 6;
			const row = Math.floor(i / 6);
			yield* Scene.instantiate("Circle", { position: S.vec3({
					x: 40 + col * 80,
					y: 90 + row * 20,
					z: -100 - i * 90,
				}), // each card deeper than the last
				radius: 26, fillColor: palette[i % palette.length] });
		}

		// fly the camera: dolly forward (z toward the cards) while orbiting (rotY)
		// and settling with a small tilt (rotX). Every animator drives the camera
		// like any other instance.
		const cam = yield* Scene.camera;
		yield* Scene.all([
			cam.pipe(Motion.moveTo({ z: -400 }, "3 seconds", "easeInOutCubic")),
			cam.pipe(
				Motion.tweenTo(
					{ rotY: Math.PI / 6, rotX: -Math.PI / 24 },
					"3 seconds",
					"easeInOutCubic",
				),
			),
		]);
		// settle back to the resting view (z = a focal-length back, per identity)
		const restZ = Runner.identityCameraView((yield* Scene.comp()).width).z;
		yield* Scene.all([
			cam.pipe(Motion.moveTo({ z: restZ }, "2.5 seconds", "easeInOutCubic")),
			cam.pipe(
				Motion.tweenTo({ rotY: 0, rotX: 0 }, "2.5 seconds", "easeInOutCubic"),
			),
		]);
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
