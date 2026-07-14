import { Motion, Scene, Shapes } from "effect-motion";

// The camera follows a moving subject. The subject travels the full width in
// world space; a forked camera pan tracks it concurrently, so the runner
// keeps the subject roughly centred while background dots slide past.
export const scene = Scene.make(function* () {
	// static backdrop the camera reveals as it pans
	for (const x of [80, 200, 320, 440, 560, 680]) {
		yield* Scene.instantiate(Shapes.Circle, {
			x,
			y: 70,
			radius: 6,
			fill: "#544f80",
		});
	}

	const runner = yield* Scene.instantiate(Shapes.Circle, {
		x: 100,
		y: 180,
		radius: 20,
		fill: "#ff8906",
	});

	const cam = yield* Scene.camera;
	// fork the camera pan so it runs alongside the subject's travel; the
	// camera lands where the subject does, keeping it framed on centre
	yield* Scene.fork(
		cam.pipe(Motion.moveTo({ x: 300 }, "2.5 seconds", "easeInOutCubic")),
	);
	yield* runner.pipe(
		Motion.moveTo({ x: 400 }, "2.5 seconds", "easeInOutCubic"),
	);
});
