import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// The sine wave IS circular motion, unrolled: a dot orbits the circle while
// a tracer carries its height rightward through time. Everything is driven
// from one parameter t, so the three motions stay in perfect lockstep —
// Motion.drive rebuilds each entity's data from t, once per frame.

const CENTER = { x: -560, y: 0 }; // circle center
const R = 240; // circle radius = wave amplitude
const TURNS = 2; // full revolutions traced
const WAVE_X0 = -140; // where the wave starts
const WAVE_W = 1000; // how far one full trace runs
const SAMPLES = 240;

const angle = (t: number) => t * TURNS * 2 * Math.PI;
const orbit = (t: number) => ({
	x: CENTER.x + R * Math.cos(angle(t)),
	y: CENTER.y + R * Math.sin(angle(t)),
});
const waveX = (t: number) => WAVE_X0 + t * WAVE_W;

const noFill = Color.rgba(0, 0, 0, 0);

export const scene = Scene.make(
	"sine from circle",
	function* () {
		// the unit circle (to scale), its axes, and the wave's time axis
		yield* Scene.instantiate("Circle", {
			position: Entity.vec3(CENTER),
			radius: R,
			fillColor: noFill,
			strokeColor: Color.hex("#3d4266"),
			strokeWidth: 4,
		});
		yield* Scene.instantiate("Line", {
			position: Entity.vec3({ x: WAVE_X0, y: 0 }),
			end: Entity.vec3({ x: WAVE_W }),
			strokeColor: Color.hex("#3d4266"),
			strokeWidth: 3,
		});

		const orbiter = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: CENTER.x + R, y: CENTER.y }),
			radius: 18,
			fillColor: Color.hex("#ff8906"),
		});
		// the height line: from the orbiting dot straight across to the tracer
		const connector = yield* Scene.instantiate("Line", {
			position: Entity.vec3({ x: CENTER.x + R, y: CENTER.y }),
			end: Entity.vec3({ x: WAVE_X0 - (CENTER.x + R) }),
			strokeColor: Color.hex("#94a3b8"),
			strokeWidth: 2,
			opacity: 0.5,
		});
		const tracer = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: WAVE_X0, y: 0 }),
			radius: 12,
			fillColor: Color.hex("#e53170"),
		});
		const wave = yield* Scene.instantiate("Path", {
			position: Entity.vec3({}),
			fillColor: noFill,
			strokeColor: Color.hex("#e53170"),
			strokeWidth: 5,
			commands: [{ _tag: "M", x: WAVE_X0, y: 0 }],
		});

		// one t drives four entities for the whole take — same duration, same
		// linear timing, so the frame barrier keeps them in lockstep
		const TAKE = "9 seconds";
		yield* Scene.all([
			orbiter.pipe(
				Motion.drive(TAKE, "linear", (t, data) => ({
					...data,
					position: Entity.vec3(orbit(t)),
				})),
			),
			connector.pipe(
				Motion.drive(TAKE, "linear", (t, data) => ({
					...data,
					position: Entity.vec3(orbit(t)),
					end: Entity.vec3({ x: waveX(t) - orbit(t).x }),
				})),
			),
			tracer.pipe(
				Motion.drive(TAKE, "linear", (t, data) => ({
					...data,
					position: Entity.vec3({ x: waveX(t), y: orbit(t).y }),
				})),
			),
			wave.pipe(
				Motion.drive(TAKE, "linear", (t, data) => {
					const n = Math.max(1, Math.ceil(t * SAMPLES));
					return {
						...data,
						commands: [
							{ _tag: "M" as const, x: WAVE_X0, y: 0 },
							...Array.from({ length: n }, (_, i) => {
								const u = (t * (i + 1)) / n;
								return {
									_tag: "L" as const,
									x: waveX(u),
									y: orbit(u).y,
								};
							}),
						],
					};
				}),
			),
		]);
		yield* Motion.wait("800 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
