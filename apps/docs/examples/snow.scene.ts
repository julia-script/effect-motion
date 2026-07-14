import { Particles, Scene } from "effect-motion";

// Snow: a downward stream with gentle gravity and a wide, slow launch so
// flakes fan out and sink. Same emitter as the confetti burst, just aimed
// down with long lives — emission model and forces are the only difference
// between "celebration" and "calm".
export const scene = Scene.make(function* () {
	const snow = yield* Particles.emitter({
		// emit from near the top, angled downward (180° = straight down)
		x: 250,
		y: 20,
		speed: [20, 50],
		angle: [150, 210], // a downward cone
		life: [3, 5],
		size: [1.5, 4],
		opacityRange: [0.5, 1],
		gravity: 30, // slow sink
		palette: ["#fffffe", "#e8f0ff", "#cfe0ff"],
		opacityOverLife: { from: 1, to: 0.2, ease: "linear" },
		capacity: 350,
	});

	yield* Particles.simulate(snow, "5 seconds", { rate: 45 });
});
