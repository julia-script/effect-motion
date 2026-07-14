import { Particles, Scene } from "effect-motion";

// A floating field: particles spread EVENLY across the frame from the
// start, each given a tiny random drift, wrapping at the edges forever.
// There's no source and no lifecycle — `Particles.field` + the `fill`
// emission seed the whole region once and the field just breathes in place.
// This is the ambient "starfield / dust" look, as opposed to a fountain.
export const scene = Scene.make(function* () {
	const stars = yield* Particles.field({
		// omit `region` to fill the whole frame
		size: [0.5, 1.5],
		// a random per-particle opacity makes some stars faint, some bright
		opacityRange: [0.2, 1],
		drift: [4, 12], // gentle wander, px/sec, in a random direction
		palette: ["#a7a9be", "#d4d4e0", "#fffffe"],
		capacity: 160,
	});

	// `fill: 140` scatters 140 particles across the whole frame at once
	yield* Particles.simulate(stars, "12 seconds", { fill: 140 });
});
