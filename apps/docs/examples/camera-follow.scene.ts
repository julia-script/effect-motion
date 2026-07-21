import { Camera, Color, Motion, Entities as S, Scene } from "effect-motion";

// Two subjects, one camera. Follow the first, hand off to the second with
// an eased lookAt — a RETARGETED tween, so it lands exactly on the moving
// target — then follow it. The dim dots never move: every shift you see
// is the camera re-aiming. The camera goes LAST in Scene.all, because
// branches run in array order each frame — that way it reads the same
// frame's subject positions (putting it first would just add a
// deterministic one-frame trail).
export const scene = Scene.make(
	function* () {
		// a static field of dots at scattered depths, so the aim reads
		for (let i = 0; i < 24; i++) {
			const col = i % 6;
			const row = Math.floor(i / 6);
			yield* Scene.instantiate("Circle", {
				position: S.vec3({
					x: 40 + col * 84,
					y: 40 + row * 74,
					z: -150 - ((i * 137) % 500),
				}),
				radius: 3,
				fillColor: Color.hex("#3d4266"),
			});
		}

		const a = yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 80, y: 120 }),
			radius: 14,
			fillColor: Color.hex("#e53170"),
		});
		const b = yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 380, y: 210, z: -400 }),
			radius: 14,
			fillColor: Color.hex("#ff8906"),
		});

		const cam = yield* Scene.camera;
		// phase 1: a drifts away into depth, the camera tracking it (camera
		// last in the array, so it reads the same frame's position)
		yield* Scene.all([
			a.pipe(
				Motion.moveTo(
					{ x: 190, y: 80, z: -300 },
					"3 seconds",
					"easeInOutCubic",
				),
			),
			cam.pipe(Camera.follow(a, "3 seconds")),
		]);
		// phase 2: b starts moving as the camera re-aims — the retargeted
		// lookAt converges onto the moving target, and follow takes over
		// seamlessly the frame it lands
		yield* Scene.all([
			b.pipe(
				Motion.moveTo(
					{ x: 260, y: 140, z: -100 },
					"4 seconds",
					"easeInOutCubic",
				),
			),
			cam.pipe(
				Camera.lookAt(b, "1 second", "easeInOutCubic"),
				Camera.follow(b, "3 seconds"),
			),
		]);
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
