import { Camera, Color, Motion, Scene, Shapes } from "effect-motion";

// Depth of field: aperture > 0 opts in, focusDistance picks the sharp
// plane. Both are plain camera fields, so a rack focus — the classic
// attention shift — is one tween.
export const scene = Scene.make(
	function* () {
		// three subjects at three depths
		yield* Scene.instantiate(Shapes.Circle, {
			x: 130,
			y: 150,
			z: 300, // near (in front of the z=0 plane)
			radius: 40,
			fill: Color.hex("#7f5af0"),
		});
		yield* Scene.instantiate(Shapes.Circle, {
			x: 250,
			y: 150,
			z: 0, // the resting focus plane
			radius: 40,
			fill: Color.hex("#2cb67d"),
		});
		yield* Scene.instantiate(Shapes.Circle, {
			x: 400,
			y: 150,
			z: -600, // far
			radius: 40,
			fill: Color.hex("#ff8906"),
		});

		const camera = yield* Scene.instantiate(Camera.Camera, {
			aperture: 14,
		});
		yield* Scene.setCamera(camera);

		// the Runner filled focusDistance with the resting distance (z=0 sharp) —
		// read it back so the racks are offsets from that plane
		const focus = (yield* Scene.data(camera)).focusDistance ?? 0;
		yield* Motion.wait("600 millis");
		// rack to the near subject: focusDistance shrinks by its z offset
		yield* Motion.tweenTo(
			camera,
			{ focusDistance: focus - 300 },
			"900 millis",
			"easeInOutCubic",
		);
		yield* Motion.wait("600 millis");
		// rack past the mid plane out to the far subject
		yield* Motion.tweenTo(
			camera,
			{ focusDistance: focus + 600 },
			"1200 millis",
			"easeInOutCubic",
		);
		yield* Motion.wait("800 millis");
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
