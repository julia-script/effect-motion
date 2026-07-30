import * as Camera from "effect-motion/Camera";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// The 2.5D premise in one shot: every shape here is FLAT, but each ring
// sits at its own depth, so the moment the camera starts to orbit, parallax
// separates the layers and the arrangement reads as a volume.

const RINGS: ReadonlyArray<{ z: number; r: number; n: number; hex: string }> = [
	{ z: 420, r: 210, n: 6, hex: "#e53170" },
	{ z: 0, r: 330, n: 10, hex: "#7f5af0" },
	{ z: -420, r: 450, n: 14, hex: "#2cb67d" },
	{ z: -840, r: 570, n: 18, hex: "#ff8906" },
];

export const scene = Scene.make(
	"depth orbit",
	function* () {
		yield* Scene.instantiate("Circle", {
			radius: 70,
			fillColor: Color.hex("#fffffe"),
		});

		for (const ring of RINGS) {
			for (let k = 0; k < ring.n; k++) {
				const a = (k / ring.n) * 2 * Math.PI;
				yield* Scene.instantiate("Rect", {
					position: Entity.vec3({
						x: ring.r * Math.cos(a),
						y: ring.r * Math.sin(a),
						z: ring.z,
					}),
					width: 70,
					height: 70,
					fillColor: Color.hex(ring.hex),
				});
			}
		}

		// pin the aim to the core, then swing around it and back — parallax
		// between the rings is what sells the depth
		const camera = yield* Scene.camera;
		yield* camera.pipe(
			Camera.lookAt({ x: 0, y: 0, z: 0 }),
			Camera.orbitTo(1.1, "3 seconds", "easeInOutSine"),
			Camera.orbitTo(-1.1, "3 seconds", "easeInOutSine"),
			Camera.dollyTo(1600, "1500 millis", "easeInOutCubic"),
			Camera.orbitTo(0.6, "2 seconds", "easeInOutSine"),
		);
		yield* Motion.wait("500 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
