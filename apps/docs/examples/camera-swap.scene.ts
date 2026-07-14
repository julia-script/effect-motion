import { Camera, Motion, Scene, Shapes } from "effect-motion";

// Two cameras, one cut. We OPEN on the wide two-shot so the viewer sees both
// subjects and where they are — that's the reference frame that makes the cut
// readable. Then camera A pushes in on the left subject; Scene.setCamera hands
// the view to camera B, already framed on the right subject (an instant cut);
// B eases back out to the wide shot.
export const scene = Scene.make(function* () {
	const left = yield* Scene.instantiate(Shapes.Circle, {
		x: 130,
		y: 150,
		radius: 24,
		fill: "#e53170",
	});
	const right = yield* Scene.instantiate(Shapes.Circle, {
		x: 370,
		y: 150,
		radius: 24,
		fill: "#2cb67d",
	});

	const camA = yield* Scene.camera;
	// hold the wide two-shot so the viewer registers both subjects first
	yield* Motion.wait("900 millis");
	// a small "who's talking" cue on the left before we push in
	yield* left.pipe(
		Motion.tweenTo({ radius: 30 }, "300 millis", "easeOutCubic"),
	);

	// shot A: push in on the LEFT subject (pan so x=130 sits on frame centre)
	yield* Scene.all([
		camA.pipe(Motion.tweenTo({ zoom: 1.9 }, "900 millis", "easeInOutCubic")),
		camA.pipe(Motion.moveTo({ x: -120, y: 0 }, "900 millis", "easeInOutCubic")),
	]);
	yield* Motion.wait("500 millis");

	// CUT: swap to camera B, pre-framed on the RIGHT subject at the same zoom
	const camB = yield* Scene.instantiate(Camera.Camera, {
		x: 120,
		y: 0,
		zoom: 1.9,
	});
	yield* Scene.setCamera(camB);
	// the right subject reacts, so the cut clearly lands on a different subject
	yield* right.pipe(
		Motion.tweenTo({ radius: 30 }, "300 millis", "easeOutCubic"),
	);
	yield* Motion.wait("400 millis");

	// pull back out to the wide two-shot — re-establishes context
	yield* Scene.all([
		camB.pipe(Motion.tweenTo({ zoom: 1 }, "900 millis", "easeInOutCubic")),
		camB.pipe(Motion.moveTo({ x: 0, y: 0 }, "900 millis", "easeInOutCubic")),
	]);
});
