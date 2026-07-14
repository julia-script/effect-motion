import { Motion, Physics, Scene, Shapes } from "effect-motion";

// An impact shake: a subject slams down, then the camera springs off-centre
// and settles back. Springs give the shake its overshoot-and-decay feel for
// free — no keyframed wobble. The camera is animated like any instance.
export const scene = Scene.make(function* () {
	const block = yield* Scene.instantiate(Shapes.Square, {
		x: 234,
		y: 40,
		size: 64,
		fill: "#e53170",
	});
	// ground line so the impact reads
	yield* Scene.instantiate(Shapes.Line, {
		x: 40,
		y: 210,
		x2: 460,
		y2: 210,
		stroke: "#544f80",
	});

	// drop the block
	yield* block.pipe(Physics.springTo({ y: 146 }, "strike"));

	const cam = yield* Scene.camera;
	// snap the camera to an offset instantly, then spring it back to centre
	// with a springy, under-damped preset — the ring-back oscillation IS the
	// shake (one settle, not a settle-then-return).
	yield* Scene.update(cam, (d) => ({ ...d, x: 16, y: 11 }));
	// under-damped enough to ring a few times, damped enough to die in ~1s
	yield* cam.pipe(
		Physics.springTo(
			{ x: 0, y: 0 },
			{ mass: 0.1, stiffness: 32, damping: 0.4 },
		),
	);
	yield* Motion.wait("400 millis");
});
