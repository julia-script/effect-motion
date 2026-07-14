import { Motion, Scene, Shapes } from "effect-motion";

// A punch-in: zoom the camera onto a subject while recentering on it, hold,
// then pull back out. Pan and zoom animate together via Scene.all, so the
// subject stays framed the whole way in.
export const scene = Scene.make(function* () {
	// a field of dots; we punch in on the red one at (350, 90)
	for (const [x, y, fill] of [
		[120, 210, "#7f5af0"],
		[250, 150, "#2cb67d"],
		[350, 90, "#e53170"],
		[410, 220, "#ff8906"],
	] as const) {
		yield* Scene.instantiate(Shapes.Circle, { x, y, radius: 16, fill });
	}

	const cam = yield* Scene.camera;
	// zoom to 2.5× centered on the subject: at zoom Z about the viewport
	// centre (250,150), panning the camera to (subject - centre) keeps the
	// subject on screen centre — here roughly (100, -60).
	yield* Scene.all([
		cam.pipe(Motion.tweenTo({ zoom: 2.5 }, "1.2 seconds", "easeInOutCubic")),
		cam.pipe(
			Motion.moveTo({ x: 100, y: -60 }, "1.2 seconds", "easeInOutCubic"),
		),
	]);
	yield* Motion.wait("500 millis");
	// pull back out to the establishing shot
	yield* Scene.all([
		cam.pipe(Motion.tweenTo({ zoom: 1 }, "1 second", "easeInOutCubic")),
		cam.pipe(Motion.moveTo({ x: 0, y: 0 }, "1 second", "easeInOutCubic")),
	]);
});
