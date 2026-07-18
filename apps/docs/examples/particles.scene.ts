import { Color, Particles, Scene } from "effect-motion";

// A fountain built with the real particle system: one `Particles.emitter`
// streaming particles up in a narrow cone, pulled back down by gravity,
// fading as they age. This is ONE instance and ONE animator fiber backing
// the whole spray — not one fiber per particle. Same seeded Random, so the
// spray is byte-identical every replay.
const palette = [
	Color.hex("#e53170"),
	Color.hex("#ff8906"),
	Color.hex("#7f5af0"),
	Color.hex("#2cb67d"),
	Color.hex("#3da9fc"),
];

export const scene = Scene.make(function* () {
	const fountain = yield* Particles.emitter({
		x: 250,
		y: 290,
		speed: [300, 600], // launched hard upward…
		angle: [-20, 20], // …in a narrow cone
		life: [1, 1.8],
		size: [3, 7],
		gravity: 800, // gravity arcs them back down
		palette,
		// each jet shrinks and fades as it falls
		sizeOverLife: { from: 1, to: 0.5, ease: "easeInQuad" },
		opacityOverLife: { from: 1, to: 0, ease: "easeInQuad" },
		capacity: 300,
	});

	// a continuous stream for 3 seconds
	yield* Particles.simulate(fountain, "3 seconds", { rate: 90 });
});
