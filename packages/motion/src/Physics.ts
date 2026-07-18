import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import type * as Schema from "effect/Schema";
import * as Entity from "./Entity.js";
import * as Instance from "./Instance.js";
import * as Runner from "./Runner.js";
import * as Scene from "./Scene.js";

/**
 * Physics-based motion: durationless animations that carry momentum and
 * end on their own. A spring is a damped harmonic oscillator simulated
 * until displacement and velocity settle within a tolerance — there is
 * no duration to specify, so springs are combinators here rather than
 * `TimingInput`s.
 */

export interface Spring {
	readonly mass: number;
	readonly stiffness: number;
	readonly damping: number;
	readonly initialVelocity?: number;
}

/** fast, gently damped general-purpose spring */
export const defaultSpring: Spring = {
	mass: 0.05,
	stiffness: 10,
	damping: 0.5,
};

export const springs = {
	beat: { mass: 0.13, stiffness: 5.7, damping: 1.2, initialVelocity: 10 },
	plop: { mass: 0.2, stiffness: 20, damping: 0.68 },
	bounce: { mass: 0.08, stiffness: 4.75, damping: 0.05 },
	swing: { mass: 0.39, stiffness: 19.85, damping: 2.82 },
	jump: { mass: 0.04, stiffness: 10, damping: 0.7, initialVelocity: 8 },
	strike: { mass: 0.03, stiffness: 20, damping: 0.9, initialVelocity: 4.8 },
	smooth: { mass: 0.16, stiffness: 15.35, damping: 1.88 },
} as const satisfies Record<string, Spring>;

export type SpringName = keyof typeof springs;

/** a preset name (autocompleted) or a custom spring configuration */
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
	Name extends string,
	Data extends Schema.Top,
	Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
	E = never,
	R = never,
>(
	instanceOrEffect: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	from: Partial<Entity.Position> | undefined,
	to: Partial<Entity.Position>,
	springInput?: SpringInput,
	settleTolerance?: number,
) {
	const instance = yield* Instance.flatten(instanceOrEffect);
	const lens = Entity.traitOrDie<Data["Type"], Entity.Position>(
		instance.entity,
		"~position",
	);
	const current = lens.get(yield* Scene.data(instance));
	// partial targets/origins hold the missing axis at its current value
	const target = { ...current, ...to };
	const start = { ...current, ...(from ?? {}) };
	yield* simulate(
		start,
		target,
		springInput ?? defaultSpring,
		(value) => Scene.update(instance, (data) => lens.set(data, value)),
		settleTolerance,
	);
	return instance;
});

const firstArgIsInstance = (args: IArguments) => Instance.isInstance(args[0]);

type HasPosition<Data extends Schema.Top> = {
	readonly "~position": Entity.TraitLens<Data["Type"], Entity.Position>;
};

/**
 * Spring an instance to a position via its `~position` trait — the
 * durationless counterpart of `Motion.moveTo` (settles exactly, length
 * emerges from the physics). Dual:
 * `springTo(instance, to, springInput?, settleTolerance?)` or
 * `instance.pipe(springTo(to, springInput?, settleTolerance?))`.
 */
export const springTo = dual<
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>> &
			HasPosition<Data>,
	>(
		to: Partial<Entity.Position>,
		springInput?: SpringInput,
		settleTolerance?: number,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>,
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>> &
			HasPosition<Data>,
		E = never,
		R = never,
	>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
		to: Partial<Entity.Position>,
		springInput?: SpringInput,
		settleTolerance?: number,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>
>(firstArgIsInstance, (instance, to, springInput, settleTolerance) =>
	springPosition(instance, undefined, to, springInput, settleTolerance),
);

/** Like `springTo`, but from an explicit position (partials filled from current). */
export const spring = dual<
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>> &
			HasPosition<Data>,
	>(
		from: Partial<Entity.Position>,
		to: Partial<Entity.Position>,
		springInput?: SpringInput,
		settleTolerance?: number,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>,
	<
		Name extends string,
		Data extends Schema.Top,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>> &
			HasPosition<Data>,
		E = never,
		R = never,
	>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
		from: Partial<Entity.Position>,
		to: Partial<Entity.Position>,
		springInput?: SpringInput,
		settleTolerance?: number,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>
>(firstArgIsInstance, (instance, from, to, springInput, settleTolerance) =>
	springPosition(instance, from, to, springInput, settleTolerance),
);
