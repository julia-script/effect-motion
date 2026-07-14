import { Particles, Scene } from "effect-motion";

// Floating motes: slow ambient dust rising from below. Unlike the evenly
// spread `field`, this is a source `emitter` with a slow wide cone, long
// lives, and a faint upward buoyancy — a gentle stream rather than a
// populated field. A random per-particle opacity keeps them from looking
// uniform.
export const scene = Scene.make(function* () {
	const motes = yield* Particles.emitter({
		x: 250,
		y: 320,
		// slow and gentle, drifting up with a little sideways wander
		speed: [8, 28],
		angle: [-40, 40],
		life: [3, 6],
		size: [1.5, 3.5],
		opacityRange: [0.3, 0.8],
		gravity: -6, // a faint upward buoyancy
		palette: ["#a7a9be", "#d4d4e0", "#fffffe"],
		// born soft, fade to nothing as they drift up — no hard pop-out
		opacityOverLife: { from: 0.9, to: 0, ease: "easeInQuad" },
		sizeOverLife: { from: 0.6, to: 1, ease: "easeOutCubic" },
		capacity: 400,
	});

	// a slow, steady stream for a 5-second ambient loop
	yield* Particles.simulate(motes, "5 seconds", { rate: 30 });
});
