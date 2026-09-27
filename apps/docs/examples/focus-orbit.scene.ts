import { Random } from "effect";
import * as Camera from "effect-motion/Camera";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// A shallow lens orbiting a subject. Flat shapes are scattered through depth
// around a sun at the origin; the camera swings around it and pushes in,
// and because the focus distance follows the camera's distance to the
// subject, the sun and its ring stay crisp while everything else melts into soft shapes.

const PALETTE = ["#ff006e", "#fb5607", "#3a86ff", "#8338ec", "#06d6a0"];

// flat colour (shapes draw no outline unless a strokeColor is set)
const flat = (hex: string) => ({ fillColor: Color.hex(hex) });

export const scene = Scene.make(
	"focus orbit",
	function* () {
		// a seeded scatter, kept clear of the subject so it reads alone
		for (let i = 0; i < 90; i++) {
			const x = yield* Random.nextBetween(-1700, 1700);
			const y = yield* Random.nextBetween(-950, 950);
			const z = yield* Random.nextBetween(-3200, 1300);
			if (Math.hypot(x, y, z) < 700) {
				continue;
			}
			const hex = PALETTE[i % PALETTE.length] ?? "#ffffff";
			const size = yield* Random.nextBetween(60, 180);
			if (i % 3 === 0) {
				yield* Scene.instantiate("Rect", {
					position: Entity.vec3({ x, y, z }),
					rotation: Entity.vec3({ z: yield* Random.nextBetween(0, Math.PI) }),
					width: size * 1.4,
					height: size * 1.4,
					...flat(hex),
				});
			} else {
				yield* Scene.instantiate("Circle", {
					position: Entity.vec3({ x, y, z }),
					radius: size,
					...flat(hex),
				});
			}
		}

		// the subject: a sun and a ring of satellites, all on the focus plane
		yield* Scene.instantiate("Circle", {
			radius: 170,
			...flat("#ffbe0b"),
		});
		for (let k = 0; k < 12; k++) {
			const a = (k / 12) * 2 * Math.PI;
			yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ x: 300 * Math.cos(a), y: 300 * Math.sin(a) }),
				rotation: Entity.vec3({ z: a }),
				width: 44,
				height: 44,
				...flat("#ffbe0b"),
			});
		}

		// aim at the subject; at rest its distance IS the default focus
		const camera = yield* Scene.camera;
		yield* Camera.lookAt(camera, { x: 0, y: 0, z: 0 });
		yield* Scene.update(camera, (props) => ({ ...props, aperture: 110 }));
		yield* Motion.wait("500 millis");

		// orbiting keeps the distance, so the focus holds on its own
		yield* Camera.orbitTo(camera, -0.6, "2500 millis", "easeInOutSine");

		// a push-in changes the distance: pull focus along with it
		yield* Scene.all([
			Camera.dollyTo(camera, 1900, "2 seconds", "easeInOutCubic"),
			Motion.tweenTo(
				camera,
				{ focusDistance: 1900 },
				"2 seconds",
				"easeInOutCubic",
			),
		]);
		yield* Camera.orbitTo(camera, 0.6, "3500 millis", "easeInOutSine");
		yield* Motion.wait("500 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.hex("#0d1b2a") },
);
