import { Color, Motion, Runner, Entities as S, Scene } from "effect-motion";

// A punch-in, the 3D-camera way: there is no `zoom` scalar any more. Grow the
// camera's `focalLength` to narrow the field of view (an optical zoom) while
// panning to keep the subject centred, hold, then pull back. Dollying (moving
// the camera's `z`) is the other way to get closer — a different look, since
// it changes perspective; focal length does not.
export const scene = Scene.make(
	function* () {
		// a field of dots; we punch in on the red one at (350, 90)
		for (const [x, y, fill] of [
			[120, 210, Color.hex("#7f5af0")],
			[250, 150, Color.hex("#2cb67d")],
			[350, 90, Color.hex("#e53170")],
			[410, 220, Color.hex("#ff8906")],
		] as const) {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ x, y }),
				radius: 16,
				fillColor: fill,
			});
		}

		const cam = yield* Scene.camera;
		// the resting focal length is width-relative (AE's 50mm equivalent) —
		// read it off the identity view instead of hardcoding a number
		const { width } = yield* Scene.comp();
		const rest = Runner.identityCameraView(width).focalLength;
		// zoom in: 2.5× the default focal length narrows the FOV. Pan the camera
		// so the subject (350,90) sits at the viewport centre (250,150) — the pan
		// is (subject - centre) = (100, -60).
		yield* Scene.all([
			cam.pipe(
				Motion.tweenTo(
					{ focalLength: rest * 2.5 },
					"1.2 seconds",
					"easeInOutCubic",
				),
			),
			cam.pipe(
				Motion.moveTo({ x: 100, y: -60 }, "1.2 seconds", "easeInOutCubic"),
			),
		]);
		yield* Motion.wait("500 millis");
		// pull back out to the establishing shot
		yield* Scene.all([
			cam.pipe(
				Motion.tweenTo({ focalLength: rest }, "1 second", "easeInOutCubic"),
			),
			cam.pipe(Motion.moveTo({ x: 0, y: 0 }, "1 second", "easeInOutCubic")),
		]);
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
