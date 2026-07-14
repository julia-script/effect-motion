import { Motion, Physics, Scene, Shapes } from "effect-motion";

// An impact shake. The block falls and hits the ground on an exact frame
// (a fixed-duration accelerating drop, so there's no spring settle-tail
// between landing and the shake). On contact the camera jolts DOWN — along
// the impact axis — then an under-damped spring rings it back to centre.
// The ring-back oscillation IS the shake, no keyframed wobble.
export const scene = Scene.make(function* () {
	const block = yield* Scene.instantiate(Shapes.Square, {
		x: 234,
		y: -70,
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

	// fall and land on the ground on an exact frame — easeInQuad reads as
	// gravity accelerating the block into the floor
	yield* block.pipe(Motion.moveTo({ y: 146 }, "500 millis", "easeInQuad"));

	const cam = yield* Scene.camera;
	// impact came from above, so jolt the view mostly DOWN (a little lateral),
	// then spring back — the decaying ring is the shake. Under-damped enough
	// to oscillate a few times, damped enough to die in ~1s.
	yield* Scene.update(cam, (d) => ({ ...d, x: 5, y: 20 }));
	yield* cam.pipe(
		Physics.springTo(
			{ x: 0, y: 0 },
			{ mass: 0.1, stiffness: 34, damping: 0.35 },
		),
	);
	yield* Motion.wait("400 millis");
});
