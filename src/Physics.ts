import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import type * as Schema from "effect/Schema";
import * as Instance from "./Instance";
import {
	type InterpolableOnly,
	resolveTarget,
	startValues,
	type Target,
} from "./Motion";
import * as Runner from "./Runner";
import * as Scene from "./Scene";

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

export const resolve = (input: SpringInput): Spring => {
	const spring = typeof input === "string" ? springs[input] : input;
	if (spring === undefined) {
		// unreachable for typed consumers; catches plain-JS typos
		throw new Error(`Physics: unknown spring "${String(input)}"`);
	}
	if (spring.mass <= 0) {
		throw new Error("Physics: spring mass must be greater than 0");
	}
	if (spring.stiffness < 0) {
		throw new Error("Physics: spring stiffness must be >= 0");
	}
	if (spring.damping < 0) {
		throw new Error("Physics: spring damping must be >= 0");
	}
	return spring;
};

// fixed-rate integration keeps trajectories frame-rate independent:
// explicit Euler diverges with large dt, so each scene frame consumes
// its 1/frameRate seconds in 1/120 s substeps
const SIMULATION_STEP = 1 / 120;

/**
 * Spring-animate each key of `from` toward `to`, calling `fn` once per
 * scene frame until every key's displacement AND velocity are within
 * `settleTolerance`, then snap exactly onto `to`. Length emerges from
 * the physics — a zero-damping spring never settles and animates
 * indefinitely (the scene keeps ticking; stepping never blocks).
 */
export const spring = Effect.fnUntraced(function* <
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
	const config = resolve(springInput);
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

const internalSpringTo = Effect.fnUntraced(function* <
	Name extends string,
	Data extends Schema.Top,
>(
	instance: Instance.Instance<Name, Data>,
	to: Target<Data>,
	springInput?: SpringInput,
	settleTolerance?: number,
) {
	const current = yield* Scene.data(instance);
	const target = resolveTarget(to, current);
	const start = startValues(current, target, {});
	yield* spring(
		start,
		target,
		springInput ?? defaultSpring,
		(value) =>
			Scene.update(
				instance,
				(data) => Object.assign({}, data, value) as Data["Type"],
			),
		settleTolerance,
	);
	return instance;
});

const firstArgIsInstance = (args: IArguments) => Instance.isInstance(args[0]);

/**
 * Spring-animate interpolable props of an instance toward `to`, reading
 * the origin from its current data and applying values via scene
 * updates. Dual: `springTo(instance, to, springInput?, settleTolerance?)`
 * or `instance.pipe(springTo(to, springInput?, settleTolerance?))`.
 * Resolves with the instance.
 */
export const springTo = dual<
	<Name extends string, Data extends Schema.Top>(
		to: Target<Data>,
		springInput?: SpringInput,
		settleTolerance?: number,
	) => (
		instance: Instance.Instance<Name, Data>,
	) => Effect.Effect<Instance.Instance<Name, Data>, never, Runner.Runner>,
	<Name extends string, Data extends Schema.Top>(
		instance: Instance.Instance<Name, Data>,
		to: Target<Data>,
		springInput?: SpringInput,
		settleTolerance?: number,
	) => Effect.Effect<Instance.Instance<Name, Data>, never, Runner.Runner>
>(firstArgIsInstance, (instance, to, springInput, settleTolerance) =>
	internalSpringTo(instance, to, springInput, settleTolerance),
);

// referenced so the type-only import group stays coherent for consumers
export type { InterpolableOnly, Target };
