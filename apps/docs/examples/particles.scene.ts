import { Duration, Effect, Random, Schedule } from "effect";
import { Motion, Scene, Shapes } from "effect-motion";

const palette = ["#e53170", "#ff8906", "#7f5af0", "#2cb67d", "#3da9fc"];

// a particle fountain: Scene.repeat spawns on a strict 40ms cadence,
// Scene.fork lets the lives overlap, and every trajectory comes from the
// scene's seeded Random — chaotic to the eye, byte-identical every replay
export const scene = Scene.make(function* () {
	const particle = Effect.gen(function* () {
		const drift = yield* Random.nextBetween(-140, 140);
		const peak = yield* Random.nextBetween(60, 240);
		const radius = yield* Random.nextBetween(3, 9);
		const rise = yield* Random.nextBetween(450, 800);
		const fall = yield* Random.nextBetween(500, 900);
		const color = Math.floor(yield* Random.nextBetween(0, palette.length));

		const dot = yield* Scene.instantiate(Shapes.Circle, {
			x: 250,
			y: 290,
			radius,
			fill: palette[color] ?? "#e53170",
		});

		// up with a little drift…
		yield* dot.pipe(
			Motion.moveTo(
				{ x: 250 + drift * 0.6, y: 290 - peak },
				Duration.millis(rise),
				"easeOutCubic",
			),
		);
		// …then fall off-screen and fade at the same time
		yield* Scene.all([
			dot.pipe(
				Motion.moveTo(
					{ x: 250 + drift, y: 310 },
					Duration.millis(fall),
					"easeInQuad",
				),
			),
			dot.pipe(Motion.fadeTo(0, Duration.millis(fall))),
		]);
	});

	// 45 spawns; fork returns immediately so the cadence never waits for a
	// particle, and the scene ends when the last one fades
	yield* Scene.repeat(
		Scene.fork(particle),
		Schedule.both(Schedule.fixed("40 millis"), Schedule.recurs(44)),
	);
});
