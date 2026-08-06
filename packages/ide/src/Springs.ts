/**
 * The spring catalog — the presets `Physics` accepts, described, simulated,
 * and drawable.
 *
 * @remarks
 * Springs have no duration: length emerges from the simulation. To say
 * anything useful in an editor ("this settles in ~34 frames") the preview
 * has to run the same integrator the engine runs, so `simulate` is a
 * faithful mirror of `Physics`'s fixed-rate loop — same 1/120 s substep,
 * same settle test, same final snap. `test/springs.test.ts` runs a real
 * scene through `Physics.springTo` and asserts the frame counts agree, so
 * a change to the engine's integrator fails here rather than drifting.
 *
 * Note the mirror is a mirror, not a re-derivation: the preset table below
 * is asserted equal to `Physics.springs` by the same test.
 */

/** A spring's physical parameters — the shape `Physics.Spring` describes. */
export interface Spring {
	readonly mass: number;
	readonly stiffness: number;
	readonly damping: number;
	readonly initialVelocity?: number;
}

/** The built-in presets, mirroring `Physics.springs`. */
export const springs = {
	beat: { mass: 0.13, stiffness: 5.7, damping: 1.2, initialVelocity: 10 },
	plop: { mass: 0.2, stiffness: 20, damping: 0.68 },
	bounce: { mass: 0.08, stiffness: 4.75, damping: 0.05 },
	swing: { mass: 0.39, stiffness: 19.85, damping: 2.82 },
	jump: { mass: 0.04, stiffness: 10, damping: 0.7, initialVelocity: 8 },
	strike: { mass: 0.03, stiffness: 20, damping: 0.9, initialVelocity: 4.8 },
	smooth: { mass: 0.16, stiffness: 15.35, damping: 1.88 },
} as const satisfies Record<string, Spring>;

/** The name of a built-in preset. */
export type SpringName = keyof typeof springs;

export interface SpringPreset {
	readonly name: SpringName;
	readonly spring: Spring;
	/** One line: what it feels like and when to reach for it. */
	readonly summary: string;
}

/** Every preset, with prose. */
export const presets: ReadonlyArray<SpringPreset> = [
	{
		name: "beat",
		spring: springs.beat,
		summary:
			"A shove out of the gate that lands soft. Loose and slow — good for a drifting entrance.",
	},
	{
		name: "plop",
		spring: springs.plop,
		summary:
			"Stiff and lightly damped: a quick arrival with one visible overshoot. The everyday 'it appeared' spring.",
	},
	{
		name: "bounce",
		spring: springs.bounce,
		summary:
			"Barely damped — rings for a long time before settling. Playful, and long; budget frames for it.",
	},
	{
		name: "swing",
		spring: springs.swing,
		summary:
			"Heavy and well damped. Travels with weight and settles without ringing.",
	},
	{
		name: "jump",
		spring: springs.jump,
		summary:
			"Light with a strong initial kick — launches, arcs, settles. Reads as a hop.",
	},
	{
		name: "strike",
		spring: springs.strike,
		summary:
			"Very light, very stiff, kicked. Snaps into place almost instantly — for impacts and accents.",
	},
	{
		name: "smooth",
		spring: springs.smooth,
		summary:
			"Near-critically damped: fast, no overshoot worth noticing. The safe default when in doubt.",
	},
];

/** Presets by name. */
export const byName: ReadonlyMap<string, SpringPreset> = new Map(
	presets.map((preset) => [preset.name as string, preset]),
);

/** Is `name` a built-in spring preset? */
export const isSpringName = (name: string): name is SpringName =>
	byName.has(name);

/** The catalog entry for a name, or `undefined` for anything else. */
export const find = (name: string): SpringPreset | undefined =>
	byName.get(name);

/** The engine's fixed integration substep — 1/120 s (`Physics.ts`). */
export const SIMULATION_STEP = 1 / 120;

/** The engine's default settle tolerance. */
export const SETTLE_TOLERANCE = 0.001;

export interface SimulationOptions {
	readonly frameRate?: number;
	/**
	 * How far the spring travels. Settling is measured in the animated
	 * field's own units, so a longer move takes more frames — a preview is
	 * only honest about a stated distance.
	 */
	readonly distance?: number;
	readonly settleTolerance?: number;
	/**
	 * Safety valve: an undamped spring never settles. Defaults to 36_000,
	 * the runner's own frame cap — a spring the engine would run to the cap
	 * is one this reports as never settling.
	 */
	readonly maxFrames?: number;
}

export interface Simulation {
	/** One value per emitted frame, normalised so 0 is the start and 1 the target. */
	readonly samples: ReadonlyArray<number>;
	/** Frames the animation occupies, final snap included. */
	readonly frames: number;
	/** `frames / frameRate`. */
	readonly seconds: number;
	/** True when `maxFrames` cut the simulation short (it never settled). */
	readonly truncated: boolean;
}

/**
 * Run a preset the way `Physics` runs it and report every frame it emits.
 *
 * @remarks
 * Mirrors `Physics.simulate` step for step — explicit Euler at a fixed
 * 1/120 s substep, the settle test applied after every substep, and the
 * exact landing frame appended at the end.
 */
export const simulate = (
	spring: Spring,
	options: SimulationOptions = {},
): Simulation => {
	const frameRate = options.frameRate ?? 60;
	const distance = options.distance ?? 100;
	const tolerance = options.settleTolerance ?? SETTLE_TOLERANCE;
	const maxFrames = options.maxFrames ?? 36_000;
	const frameDt = 1 / frameRate;

	const to = distance;
	// a zero-distance preview would divide by zero on normalisation; the
	// curve is scale-relative anyway, so fall back to a unit denominator
	const denominator = distance === 0 ? 1 : distance;
	let position = 0;
	let velocity = spring.initialVelocity ?? 0;

	const settled = () =>
		Math.abs(to - position) < tolerance && Math.abs(velocity) < tolerance;

	const substep = (dt: number) => {
		const displacement = position - to;
		const force = -spring.stiffness * displacement - spring.damping * velocity;
		velocity = velocity + (force / spring.mass) * dt;
		position = position + velocity * dt;
	};

	const samples: number[] = [];
	let done = settled();
	let truncated = false;
	while (!done) {
		if (samples.length >= maxFrames) {
			truncated = true;
			break;
		}
		let remaining = frameDt;
		while (remaining > 0) {
			substep(Math.min(SIMULATION_STEP, remaining));
			remaining -= SIMULATION_STEP;
			if (settled()) {
				done = true;
				break;
			}
		}
		if (!done) samples.push(position / denominator);
	}
	samples.push(1);

	return {
		samples,
		frames: samples.length,
		seconds: samples.length / frameRate,
		truncated,
	};
};

/** How many frames a preset occupies — the number a scene author budgets. */
export const settleFrames = (
	spring: Spring,
	options: SimulationOptions = {},
): number => simulate(spring, options).frames;
