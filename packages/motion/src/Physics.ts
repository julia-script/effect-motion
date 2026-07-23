import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as Entity from "./Entity.js";
import * as Instance from "./Instance.js";
import type * as Motion from "./Motion.js";
import * as Runner from "./Runner.js";
import * as Scene from "./Scene.js";

/**
 * Physics-based motion: animations with no duration, whose length emerges
 * from a simulation rather than being declared.
 *
 * @remarks
 * A spring is a damped harmonic oscillator, integrated until both
 * displacement and velocity fall inside a tolerance — then snapped exactly
 * onto the target. You describe the FEEL (mass, stiffness, damping) and the
 * physics decides how long it takes. That is the whole reason springs live
 * here as their own animators rather than as another easing name: an easing
 * curve is a function of a duration you supply, and a spring has no duration
 * to supply.
 *
 * Reach for a spring when motion should feel physical — something landing,
 * settling, or reacting — and for `Motion`'s tweens when you need a beat to
 * take an exact, known amount of time. A springy easing (`easeOutElastic`,
 * `easeOutBounce`) is the middle ground: spring-like shape, fixed duration.
 *
 * Named presets live in {@link springs}; the same call takes a custom
 * `{ mass, stiffness, damping }` when none of them fit.
 *
 * Determinism holds despite the simulation: integration runs at a fixed
 * internal timestep, so a spring produces identical frames at any frame rate
 * and on any machine.
 *
 * @example
 * Three springs chained — each starts where the last settled, and the whole
 * sequence takes however long the physics takes.
 * ```typescript
 * import * as Physics from "effect-motion/Physics";
 * import * as Scene from "effect-motion/Scene";
 *
 * const scene = Scene.make(function* () {
 * 	const ball = yield* Scene.instantiate("Circle", { radius: 24 });
 * 	yield* ball.pipe(
 * 		Physics.springTo({ x: 430 }, "swing"),
 * 		Physics.springTo({ x: 70 }, "bounce"),
 * 		Physics.springTo({ x: 250, y: 70 }, "jump"),
 * 	);
 * });
 * ```
 */

/**
 * A spring's physical parameters — the knobs that decide how motion feels
 * and, indirectly, how long it lasts.
 *
 * @remarks
 * The three interact, so tune by feel rather than in isolation: heavier
 * `mass` makes motion sluggish and prolongs it; higher `stiffness` pulls
 * harder toward the target and speeds it up; higher `damping` bleeds off
 * energy, trading overshoot and wobble for a quicker settle. Low damping
 * with low stiffness is what produces a long ringing tail.
 *
 * Start from a preset in {@link springs} and adjust from there — the
 * presets are the calibrated points in this space.
 */
export interface Spring {
	/** Inertia. Higher is heavier and slower to start and stop. */
	readonly mass: number;
	/** Pull toward the target. Higher is snappier. */
	readonly stiffness: number;
	/** Energy loss. Higher settles sooner with less overshoot; near 0 rings. */
	readonly damping: number;
	/**
	 * Speed the motion already carries at frame one, for launching something
	 * that should feel struck or thrown rather than pulled.
	 *
	 * @defaultValue `0`
	 */
	readonly initialVelocity?: number;
}

/**
 * The spring used when a call names none: quick and only lightly damped, so
 * it overshoots a little before settling.
 */
export const defaultSpring: Spring = {
	mass: 0.05,
	stiffness: 10,
	damping: 0.5,
};

/**
 * The named spring presets, each a calibrated point in `{ mass, stiffness,
 * damping }` space. Pass the NAME to any spring animator — it autocompletes.
 *
 * @remarks
 * Durations below are measured for a 100px move at 60fps and scale with
 * distance; a spring's length is emergent, so treat them as character, not
 * contract:
 *
 * - `strike` — hardest and fastest, launched with initial velocity (~0.7s).
 * - `jump` — a quick launched hop (~1.4s).
 * - `smooth` — mild overshoot, unobtrusive (~2s).
 * - `beat` — a small, tight pulse; the least overshoot of the set (~2.6s).
 * - `swing` — a relaxed, pendulum-like arc (~3.5s).
 * - `plop` — lands heavy and wobbles noticeably (~7s).
 * - `bounce` — barely damped, so it rings for a LONG time: about 37 seconds
 *   and 90 direction changes for a 100px move. Striking as a one-off accent,
 *   but check the frame count before putting it in a timed sequence.
 *
 * @see {@link Spring} to define your own.
 */
export const springs = {
	beat: { mass: 0.13, stiffness: 5.7, damping: 1.2, initialVelocity: 10 },
	plop: { mass: 0.2, stiffness: 20, damping: 0.68 },
	bounce: { mass: 0.08, stiffness: 4.75, damping: 0.05 },
	swing: { mass: 0.39, stiffness: 19.85, damping: 2.82 },
	jump: { mass: 0.04, stiffness: 10, damping: 0.7, initialVelocity: 8 },
	strike: { mass: 0.03, stiffness: 20, damping: 0.9, initialVelocity: 4.8 },
	smooth: { mass: 0.16, stiffness: 15.35, damping: 1.88 },
} as const satisfies Record<string, Spring>;

/** The name of a built-in preset in {@link springs}. */
export type SpringName = keyof typeof springs;

/**
 * What the spring animators accept: a preset name (autocompleted at the call
 * site) or a full {@link Spring} of your own.
 */
export type SpringInput = SpringName | Spring;

// invalid configs are defects for now; may graduate to typed errors in E
export const resolve = (input: SpringInput): Effect.Effect<Spring> =>
	Effect.suspend(() => {
		const spring = typeof input === "string" ? springs[input] : input;
		if (spring === undefined) {
			// unreachable for typed consumers; catches plain-JS typos
			return Effect.die(
				new Error(`Physics: unknown spring "${String(input)}"`),
			);
		}
		if (spring.mass <= 0) {
			return Effect.die(
				new Error("Physics: spring mass must be greater than 0"),
			);
		}
		if (spring.stiffness < 0) {
			return Effect.die(new Error("Physics: spring stiffness must be >= 0"));
		}
		if (spring.damping < 0) {
			return Effect.die(new Error("Physics: spring damping must be >= 0"));
		}
		return Effect.succeed(spring);
	});

// fixed-rate integration keeps trajectories frame-rate independent:
// explicit Euler diverges with large dt, so each scene frame consumes
// its 1/frameRate seconds in 1/120 s substeps
const SIMULATION_STEP = 1 / 120;

/**
 * The simulation engine: spring each key of `from` toward `to`, calling
 * `fn` once per scene frame until every key's displacement AND velocity
 * are within `settleTolerance`, then snap exactly onto `to`. Length
 * emerges from the physics — a zero-damping spring never settles and
 * animates indefinitely (the scene keeps ticking; stepping never
 * blocks). Internal — public animators apply to instances.
 */
const simulate = Effect.fnUntraced(function* <
	T extends Record<string, number>,
	A,
	E,
	R,
>(
	from: T,
	to: T,
	springInput: SpringInput,
	fn: (value: T) => Effect.Effect<A, E, R>,
	settleTolerance = 0.001,
) {
	const runner = yield* Runner.Runner;
	const config = yield* resolve(springInput);
	const frameDt = 1 / runner.settings.frameRate;
	const keys = Object.keys(from);

	const positions: Record<string, number> = {};
	const velocities: Record<string, number> = {};
	for (const key of keys) {
		positions[key] = from[key] as number;
		velocities[key] = config.initialVelocity ?? 0;
	}

	const settled = () =>
		keys.every(
			(key) =>
				Math.abs((to[key] as number) - (positions[key] as number)) <
					settleTolerance &&
				Math.abs(velocities[key] as number) < settleTolerance,
		);

	const substep = (dt: number) => {
		for (const key of keys) {
			const position = positions[key] as number;
			const velocity = velocities[key] as number;
			const displacement = position - (to[key] as number);
			const force =
				-config.stiffness * displacement - config.damping * velocity;
			const nextVelocity = velocity + (force / config.mass) * dt;
			velocities[key] = nextVelocity;
			positions[key] = position + nextVelocity * dt;
		}
	};

	let done = settled();
	while (!done) {
		let remaining = frameDt;
		while (remaining > 0) {
			substep(Math.min(SIMULATION_STEP, remaining));
			remaining -= SIMULATION_STEP;
			if (settled()) {
				done = true;
				break;
			}
		}
		if (!done) {
			yield* fn({ ...positions } as T);
			yield* Scene.tick;
		}
	}
	// physics only approaches the target; the final frame lands exactly
	yield* fn({ ...to });
	yield* Scene.tick;
});

const springPosition = Effect.fnUntraced(function* <
	Tag extends Entity.TagsWith<"position">,
	E = never,
	R = never,
>(
	instanceOrEffect: Instance.InstanceOrEffect<Tag, E, R>,
	from: Partial<Motion.Position> | undefined,
	to: Partial<Motion.Position>,
	springInput?: SpringInput,
	settleTolerance?: number,
) {
	const instance = yield* Instance.flattenInstance(instanceOrEffect);
	// flatten the Vec3 for the simulator: it works on flat numeric records
	// (design D2), so the tagged struct is unwrapped here and rebuilt below
	const position = (yield* Scene.data(instance)).position;
	const current = { x: position.x, y: position.y, z: position.z };
	// partial targets/origins hold the missing axis at its current value
	const target = { ...current, ...to };
	const start = { ...current, ...(from ?? {}) };
	yield* simulate(
		start,
		target,
		springInput ?? defaultSpring,
		(value) =>
			Scene.update(instance, (data) => ({
				...data,
				position: Entity.vec3(value),
			})),
		settleTolerance,
	);
	return instance;
});

const firstArgIsInstance = (args: IArguments) => Instance.isInstance(args[0]);

/**
 * Spring an instance to a position — `Motion.moveTo` with momentum instead
 * of a duration.
 *
 * @remarks
 * The animation runs until the simulation settles, then lands exactly on
 * `to`, so chaining springs is safe: each starts precisely where the last
 * finished, with no accumulated drift. How long that takes depends on the
 * spring AND the distance — a longer move rings longer.
 *
 * Because the length is emergent, a spring is awkward to synchronize
 * against a fixed beat. When several things must finish together, either
 * spring them inside a `Scene.all` and let the slowest govern, or use a
 * duration-based tween with an elastic easing.
 *
 * Targets are partial, like `moveTo` — naming only `x` holds the other axes.
 * Every axis is simulated by the same spring, so a diagonal move settles as
 * one motion.
 *
 * @param to - Target position; omitted axes hold their current value.
 * @param springInput - A preset name from {@link springs}, or a custom
 *   {@link Spring}.
 * @param settleTolerance - How close to the target (in both displacement
 *   and velocity) counts as settled. Larger ends sooner and cuts the tail.
 * @defaultValue `springInput` — {@link defaultSpring}; `settleTolerance` — `0.001`
 * @returns The instance, so animators chain.
 * @see {@link spring} to start from an explicit position.
 *
 * @example
 * A struck-then-settling entrance, using two different presets.
 * ```typescript
 * yield* badge.pipe(
 * 	Physics.springTo({ y: 120 }, "strike"),
 * 	Physics.springTo({ x: 300 }, "smooth"),
 * );
 * ```
 */
export const springTo = dual<
	<Tag extends Entity.TagsWith<"position">>(
		to: Partial<Motion.Position>,
		springInput?: SpringInput,
		settleTolerance?: number,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Entity.TagsWith<"position">, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		to: Partial<Motion.Position>,
		springInput?: SpringInput,
		settleTolerance?: number,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, to, springInput, settleTolerance) =>
	springPosition(instance, undefined, to, springInput, settleTolerance),
);

/**
 * Like {@link springTo}, but starting from an explicit position.
 *
 * @remarks
 * The springy entrance: an instance declared at its resting place can still
 * fly in from off-screen and settle, because the origin is stated rather
 * than read from the entity. Both `from` and `to` are partial and fill
 * missing axes from the current position.
 *
 * @param from - Starting position; omitted axes start at the current value.
 * @param to - Target position; omitted axes hold their current value.
 * @param springInput - A preset name from {@link springs}, or a custom
 *   {@link Spring}.
 * @param settleTolerance - How close counts as settled.
 * @defaultValue `springInput` — {@link defaultSpring}; `settleTolerance` — `0.001`
 * @returns The instance, so animators chain.
 *
 * @example
 * Drop a card in from above and let it settle where it was declared.
 * ```typescript
 * yield* card.pipe(Physics.spring({ y: -200 }, { y: 150 }, "plop"));
 * ```
 */
export const spring = dual<
	<Tag extends Entity.TagsWith<"position">>(
		from: Partial<Motion.Position>,
		to: Partial<Motion.Position>,
		springInput?: SpringInput,
		settleTolerance?: number,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Entity.TagsWith<"position">, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		from: Partial<Motion.Position>,
		to: Partial<Motion.Position>,
		springInput?: SpringInput,
		settleTolerance?: number,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, from, to, springInput, settleTolerance) =>
	springPosition(instance, from, to, springInput, settleTolerance),
);
