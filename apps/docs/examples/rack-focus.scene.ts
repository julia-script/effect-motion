import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// A rack focus is a tween. Three layers of flat shapes sit at three depths;
// the camera never moves — only `focusDistance` travels, and the sharp plane
// slides from the foreground to the back and home again.

// flat colour, no outline (shapes default to a 1px black stroke)
const flat = (hex: string) => ({ fillColor: Color.hex(hex), strokeWidth: 0 });

const FRONT = 1500;
const MID = 0;
const BACK = -2600;

export const scene = Scene.make(
	"rack focus",
	function* () {
		// back: a wall of tall slabs, far behind everything
		const slabs = ["#2d6a4f", "#40916c", "#52b788", "#74c69d", "#40916c"];
		for (const [i, hex] of slabs.entries()) {
			yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ x: (i - 2) * 900, y: 250, z: BACK }),
				width: 560,
				height: 2400,
				...flat(hex),
			});
		}

		// mid: the subject, on the resting focus plane
		yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ x: -160, y: -20, z: MID }),
			width: 620,
			height: 380,
			...flat("#ffd166"),
		});
		yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: 250, y: 90, z: MID + 60 }),
			radius: 150,
			...flat("#ef476f"),
		});

		// front: big shapes crowding the lens, half out of frame
		yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: -330, y: -200, z: FRONT }),
			radius: 120,
			...flat("#118ab2"),
		});
		yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ x: 330, y: 90, z: FRONT }),
			width: 110,
			height: 520,
			...flat("#073b4c"),
		});

		// focusDistance is a VIEW distance, so each layer's is the camera's
		// resting z minus the layer's z
		const camera = yield* Scene.camera;
		const { position } = yield* Scene.data(camera);
		const focusOn = (z: number) => ({ focusDistance: position.z - z });

		// open the lens, hold on the subject, then pull focus layer to layer
		yield* Scene.update(camera, (props) => ({ ...props, aperture: 45 }));
		yield* Motion.wait("700 millis");
		for (const z of [FRONT, BACK, MID]) {
			yield* camera.pipe(
				Motion.tweenTo(focusOn(z), "1200 millis", "easeInOutCubic"),
				Motion.wait("900 millis"),
			);
		}
		yield* Motion.wait("600 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.hex("#f4ecd8") },
);
