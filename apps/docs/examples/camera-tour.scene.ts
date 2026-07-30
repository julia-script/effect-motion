import * as Camera from "effect-motion/Camera";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// Flat shapes at different depths become a 2.5D set the moment the camera
// moves: lookAt pins the aim to the subject, dollyTo pushes along the view
// axis, and orbitTo swings around the point of interest — parallax does
// the rest.
export const scene = Scene.make(
	"camera tour",
	function* () {
		// three depth planes of slabs around a glowing subject
		const planes: ReadonlyArray<{ z: number; hex: string; y: number }> = [
			{ z: 500, hex: "#3b3a5a", y: -160 },
			{ z: 0, hex: "#544f80", y: -60 },
			{ z: -700, hex: "#3d4266", y: 40 },
		];
		for (const plane of planes) {
			for (let x = -900; x <= 900; x += 360) {
				yield* Scene.instantiate("Rect", {
					position: Entity.vec3({ x, y: plane.y, z: plane.z }),
					width: 140,
					height: 420,
					fillColor: Color.hex(plane.hex),
				});
			}
		}
		yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ y: -40, z: -250 }),
			radius: 90,
			fillColor: Color.hex("#ff8906"),
		});

		// the scene's default camera, ready to be driven
		const camera = yield* Scene.camera;

		// aim at the subject; the point of interest pins the framing from here on
		yield* camera.pipe(Camera.lookAt({ x: 0, y: -40, z: -250 }));

		// push in along the VIEW axis (not a z tween), swing around, pull out
		yield* camera.pipe(
			Camera.dollyTo(2100, "2 seconds", "easeInOutCubic"),
			Camera.orbitTo(0.6, "2 seconds", "easeInOutSine"),
			Camera.orbitTo(-0.6, "2 seconds", "easeInOutSine"),
		);
		yield* Motion.wait("400 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
