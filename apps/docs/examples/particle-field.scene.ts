import { Particles, Scene } from "effect-motion";

// A ParticleField is ONE instance backing many particles: you author the
// DISTRIBUTION (ranges drawn per particle at birth) and the field's single
// per-frame step emits, integrates and kills them. N particles cost one
// fiber and one phaser party — not N.
//
// Two emitters, two emission models: a one-shot confetti BURST up top, and
// a continuous ambient STREAM drifting up from below. Same engine, same
// seed → byte-identical every replay.
const palette = ["#e53170", "#ff8906", "#7f5af0", "#2cb67d", "#3da9fc"];

export const scene = Scene.make(function* () {
	// confetti: 120 particles born at once, launched in a wide cone, pulled
	// down by gravity, shrinking and fading as they age
	const confetti = yield* Particles.emitter({
		x: 250,
		y: 90,
		speed: [140, 320],
		angle: [-70, 70],
		life: [1.2, 2.2],
		size: [3, 6],
		gravity: 520,
		palette,
		sizeOverLife: { from: 1, to: 0.4, ease: "easeInQuad" },
		opacityOverLife: { from: 1, to: 0, ease: "easeInQuad" },
		capacity: 200,
	});

	// ambience: a slow upward stream, low gravity, long-lived, with a random
	// per-particle opacity so the embers vary in brightness
	const embers = yield* Particles.emitter({
		x: 250,
		y: 300,
		speed: [20, 60],
		angle: [-15, 15],
		life: [2.5, 4],
		size: [2, 4],
		opacityRange: [0.4, 1],
		gravity: -40,
		palette: ["#ff8906", "#f25f4c", "#ffd803"],
		opacityOverLife: { from: 0.9, to: 0, ease: "easeOutCubic" },
		capacity: 300,
	});

	// both fields advance concurrently, each ticking the phaser once/frame
	yield* Scene.all([
		Particles.simulate(confetti, "2.5 seconds", { burst: 120 }),
		Particles.simulate(embers, "2.5 seconds", { rate: 40 }),
	]);
});
