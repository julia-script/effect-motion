import { Camera, Color, Motion, Scene, Shapes } from "effect-motion";

// A dolly is a move along the VIEW axis — not a z tween (those only
// coincide when the camera is unrotated). Aim at the glowing end of a
// colonnade with Camera.lookAt, push in past the pillars with
// Camera.dollyTo, hold, and pull back out. The point of interest pins the
// framing the whole way — the far end never drifts off-center.
export const scene = Scene.make(function* () {
	const FAR = -1400;

	// floor rails running into depth (skeletal Lines: per-endpoint z)
	for (const x of [150, 350]) {
		yield* Scene.instantiate(Shapes.Line, {
			x,
			y: 260,
			z: 120,
			x2: x,
			y2: 260,
			z2: FAR,
			stroke: Color.hex("#3d4266"),
			strokeWidth: 2,
		});
	}
	// pillar pairs marching toward the far end
	for (let k = 0; k < 5; k++) {
		for (const x of [130, 350]) {
			yield* Scene.instantiate(Shapes.Rect, {
				x,
				y: 60,
				z: -120 - k * 260,
				width: 20,
				height: 200,
				fill: Color.hex("#544f80"),
			});
		}
	}
	// the subject at the end of the corridor
	yield* Scene.instantiate(Shapes.Circle, {
		x: 250,
		y: 160,
		z: FAR,
		radius: 30,
		fill: Color.hex("#ff8906"),
	});

	// the resting camera sits a focal-length back on +z, so its distance
	// to the far end is that plus |FAR| — derived, never hardcoded
	const rest = Camera.identity((yield* Scene.settings()).width).z;
	const startDistance = rest - FAR;

	const cam = yield* Scene.camera;
	yield* cam.pipe(
		Camera.lookAt({ x: 250, y: 160, z: FAR }),
		Camera.dollyTo(startDistance * 0.35, "2.5 seconds", "easeInOutCubic"),
	);
	yield* Motion.wait("500 millis");
	yield* cam.pipe(
		Camera.dollyTo(startDistance, "2.5 seconds", "easeInOutCubic"),
	);
});
