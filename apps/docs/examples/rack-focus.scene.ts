import { Color, Motion, Entities as S, Scene } from "effect-motion";

// Depth of field: aperture > 0 opts in, focusDistance picks the sharp
// plane. Both are plain camera fields, so a rack focus — the classic
// attention shift — is one tween.
export const scene = Scene.make(
	function* () {
		// three subjects at three depths
		yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 130, y: 150, z: 300 }), // near (in front of the z=0 plane)
			radius: 40,
			fillColor: Color.hex("#7f5af0"),
		});
		yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 250, y: 150, z: 0 }), // the resting focus plane
			radius: 40,
			fillColor: Color.hex("#2cb67d"),
		});
		yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 400, y: 150, z: -600 }), // far
			radius: 40,
			fillColor: Color.hex("#ff8906"),
		});

		const camera = yield* Scene.instantiate("Camera", {
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
