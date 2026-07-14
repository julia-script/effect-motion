import { Camera, Motion, Scene, Shapes } from "effect-motion";

// Two cameras, one cut. The default camera frames the left subject and pushes
// in; then Scene.setCamera hands the view to a second camera already framed on
// the right subject — an instant cut — which then eases back to the wide shot.
export const scene = Scene.make(function* () {
	yield* Scene.instantiate(Shapes.Circle, {
		x: 110,
		y: 150,
		radius: 22,
		fill: "#e53170",
	});
	yield* Scene.instantiate(Shapes.Circle, {
		x: 390,
		y: 150,
		radius: 22,
		fill: "#2cb67d",
	});

	// shot A: the default camera pushes in on the left subject
	const camA = yield* Scene.camera;
	yield* camA.pipe(
		Motion.tweenTo({ zoom: 1.8 }, "1.2 seconds", "easeInOutCubic"),
	);
	// a second camera, pre-framed on the right subject (pan (140,0) at 1.8×
	// centres roughly on x=390). Swapping to it is a hard cut.
	const camB = yield* Scene.instantiate(Camera.Camera, {
		x: 140,
		y: 0,
		zoom: 1.8,
	});
	yield* Scene.setCamera(camB);
	yield* Motion.wait("600 millis");
	// shot B eases back out to the wide two-shot
	yield* Scene.all([
		camB.pipe(Motion.tweenTo({ zoom: 1 }, "1 second", "easeInOutCubic")),
		camB.pipe(Motion.moveTo({ x: 0, y: 0 }, "1 second", "easeInOutCubic")),
	]);
});
