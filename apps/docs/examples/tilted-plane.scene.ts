import * as Camera from "effect-motion/Camera";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// Depth of field is per pixel, not per shape. A checkerboard floor recedes
// from under the lens to the horizon, so every tile spans a range of depths
// — and the blur follows that depth continuously, sharp in one band across
// the floor and softening smoothly in front of it and behind.

const FLOOR_Y = -400;
const TILE = 400;
const SUBJECT = { x: 0, y: FLOOR_Y + 260, z: -1400 };

// flat colour (shapes draw no outline unless a strokeColor is set)
const flat = (hex: string) => ({ fillColor: Color.hex(hex) });

export const scene = Scene.make(
	"tilted plane",
	function* () {
		// the floor: flat tiles tipped back by a quarter turn about x
		for (let row = 0; row < 22; row++) {
			for (let col = -6; col < 6; col++) {
				yield* Scene.instantiate("Rect", {
					position: Entity.vec3({
						x: (col + 0.5) * TILE,
						y: FLOOR_Y,
						z: 1600 - (row + 0.5) * TILE,
					}),
					rotation: Entity.vec3({ x: -Math.PI / 2 }),
					width: TILE,
					height: TILE,
					...flat((row + col) % 2 === 0 ? "#ff5d73" : "#ffe8d6"),
				});
			}
		}

		// two rows of upright posts marching into the distance
		for (let i = 0; i < 9; i++) {
			for (const side of [-1, 1]) {
				yield* Scene.instantiate("Rect", {
					position: Entity.vec3({
						x: side * 1300,
						y: FLOOR_Y + 450,
						z: 1200 - i * 900,
					}),
					width: 260,
					height: 900,
					...flat(i % 2 === 0 ? "#ffb703" : "#219ebc"),
				});
			}
		}

		// the subject: a disc standing on the floor
		yield* Scene.instantiate("Circle", {
			position: Entity.vec3(SUBJECT),
			radius: 260,
			...flat("#3a0ca3"),
		});

		// raise the camera and aim down at the subject
		const camera = yield* Scene.camera;
		yield* Scene.update(camera, (props) => ({
			...props,
			position: Entity.vec3({ x: 0, y: 700, z: 2600 }),
		}));
		yield* Camera.lookAt(camera, SUBJECT);

		// the subject's view distance — the one depth that should read sharp
		const { position } = yield* Scene.data(camera);
		const distance = Math.hypot(
			position.x - SUBJECT.x,
			position.y - SUBJECT.y,
			position.z - SUBJECT.z,
		);
		yield* Scene.update(camera, (props) => ({
			...props,
			focusDistance: distance,
			aperture: 60,
		}));

		// sweep the sharp band down the floor and back
		yield* camera.pipe(
			Motion.tweenTo({ focusDistance: 2600 }, "1400 millis", "easeInOutSine"),
			Motion.tweenTo({ focusDistance: 7000 }, "2400 millis", "easeInOutSine"),
			Motion.tweenTo(
				{ focusDistance: distance },
				"1400 millis",
				"easeInOutSine",
			),
		);

		// push in, pulling focus with the dolly so the subject stays sharp
		yield* Scene.all([
			Camera.dollyTo(camera, 2400, "2 seconds", "easeInOutCubic"),
			Motion.tweenTo(
				camera,
				{ focusDistance: 2400 },
				"2 seconds",
				"easeInOutCubic",
			),
		]);
		yield* Camera.orbitTo(camera, 0.5, "2500 millis", "easeInOutSine");
		yield* Motion.wait("500 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.hex("#1b1b3a") },
);
