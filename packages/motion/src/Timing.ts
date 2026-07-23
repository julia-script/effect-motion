/**
 * Easing curves — the shape of an animation's pacing over its duration.
 *
 * @remarks
 * An easing maps linear progress `t` (0 → 1) to eased progress. It changes
 * only WHEN a value gets where it's going, never where it ends up, so
 * swapping curves restyles motion without touching its endpoints.
 *
 * Pass any of these to an animator by name — `"easeOutCubic"` — which
 * autocompletes and is the usual form. A `TimingFunction` of your own is
 * accepted anywhere a name is.
 *
 * Choosing one, in short:
 *
 * - `linear` — mechanical, constant speed. Good for continuous motion
 *   (rotation, scrolling), stiff for anything that starts or stops.
 * - `easeOut*` — fast then settling. The default instinct for something
 *   ARRIVING; the motion is legible immediately.
 * - `easeIn*` — slow then accelerating. For something LEAVING.
 * - `easeInOut*` — eased at both ends; the natural choice for a move
 *   between two resting states.
 * - Within each family, `Sine` is the gentlest and `Quad` → `Cubic` →
 *   `Quart` → `Quint` → `Expo` progressively more pronounced. `Circ` is
 *   sharper still near the ends.
 * - `Back`, `Elastic`, `Bounce` — overshoot and oscillation, for character.
 *   These are how you get spring-LIKE motion in a fixed duration; for true
 *   physics with an emergent duration, use `Physics` instead.
 *
 * Every non-periodic easing satisfies f(0) = 0 and f(1) = 1, which is what
 * guarantees a tween lands exactly on its target. `Back` and `Elastic`
 * deliberately leave [0, 1] mid-animation — that overshoot IS the effect, so
 * consumers extrapolate rather than clamp. `Bounce` stays within [0, 1]: it
 * rebounds AWAY from the target rather than past it. `sin` and `cos` are the
 * exceptions to the endpoint rule: they trace a full periodic cycle and
 * return to where they started.
 *
 * @example
 * By name, and with a custom curve.
 * ```typescript
 * yield* box.pipe(Motion.moveTo({ x: 400 }, "1 second", "easeInOutCubic"));
 * yield* box.pipe(Motion.moveTo({ x: 0 }, "1 second", (t) => t * t));
 * ```
 */
export type TimingFunction = (t: number) => number;

/**
 * No easing: constant speed from start to finish.
 *
 * @remarks
 * The default when no timing is given. Right for continuous motion that
 * neither starts nor stops on screen; abrupt for anything that does.
 *
 * @see {@link TimingFunction} for choosing among the families.
 */
export const linear: TimingFunction = (t) => t;

/**
 * One full sine cycle: 0 → 1 → 0.
 *
 * @remarks
 * Periodic, so it deliberately RETURNS to its starting value instead of
 * ending at 1 — a tween using it finishes where it began. That makes it a
 * there-and-back helper (a pulse, a sway), not a transition between two
 * states.
 */
export const sin: TimingFunction = (t) => (1 - Math.cos(2 * Math.PI * t)) / 2;

/**
 * One full cosine cycle: 1 → 0 → 1.
 *
 * @remarks
 * {@link sin} phase-shifted: starts at the far end, dips, and comes back.
 * Also periodic, so it does not end at 1.
 */
export const cos: TimingFunction = (t) => (1 + Math.cos(2 * Math.PI * t)) / 2;

/**
 * The Sine family — the gentlest easing. Barely-there acceleration, for
 * motion that should feel eased without drawing attention.
 *
 * @see {@link TimingFunction} for choosing among the families.
 */
export const easeInSine: TimingFunction = (t) =>
	1 - Math.cos((t * Math.PI) / 2);
export const easeOutSine: TimingFunction = (t) => Math.sin((t * Math.PI) / 2);
export const easeInOutSine: TimingFunction = (t) =>
	-(Math.cos(Math.PI * t) - 1) / 2;

const easeInPow =
	(p: number): TimingFunction =>
	(t) =>
		t ** p;
const easeOutPow =
	(p: number): TimingFunction =>
	(t) =>
		1 - (1 - t) ** p;
const easeInOutPow =
	(p: number): TimingFunction =>
	(t) =>
		t < 0.5 ? 2 ** (p - 1) * t ** p : 1 - (-2 * t + 2) ** p / 2;

/**
 * The polynomial families, from gentlest to most pronounced: Quad (t²),
 * Cubic (t³), Quart (t⁴), Quint (t⁵). Cubic is the everyday workhorse.
 *
 * @see {@link TimingFunction} for choosing among the families.
 */
export const easeInQuad = easeInPow(2);
export const easeOutQuad = easeOutPow(2);
export const easeInOutQuad = easeInOutPow(2);
export const easeInCubic = easeInPow(3);
export const easeOutCubic = easeOutPow(3);
export const easeInOutCubic = easeInOutPow(3);
export const easeInQuart = easeInPow(4);
export const easeOutQuart = easeOutPow(4);
export const easeInOutQuart = easeInOutPow(4);
export const easeInQuint = easeInPow(5);
export const easeOutQuint = easeOutPow(5);
export const easeInOutQuint = easeInOutPow(5);

/**
 * The Expo family — the most extreme of the smooth curves: near-motionless
 * at the slow end, very fast at the other. For dramatic arrivals and exits.
 *
 * @see {@link TimingFunction} for choosing among the families.
 */
export const easeInExpo: TimingFunction = (t) =>
	t === 0 ? 0 : 2 ** (10 * t - 10);
export const easeOutExpo: TimingFunction = (t) =>
	t === 1 ? 1 : 1 - 2 ** (-10 * t);
export const easeInOutExpo: TimingFunction = (t) =>
	t === 0
		? 0
		: t === 1
			? 1
			: t < 0.5
				? 2 ** (20 * t - 10) / 2
				: (2 - 2 ** (-20 * t + 10)) / 2;

/**
 * The Circ family — a quarter-circle arc. Sharper at the ends than the
 * polynomials, with a distinctly mechanical, geometric feel.
 *
 * @see {@link TimingFunction} for choosing among the families.
 */
export const easeInCirc: TimingFunction = (t) => 1 - Math.sqrt(1 - t ** 2);
export const easeOutCirc: TimingFunction = (t) => Math.sqrt(1 - (t - 1) ** 2);
export const easeInOutCirc: TimingFunction = (t) =>
	t < 0.5
		? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2
		: (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2;

/**
 * Build a Back easing with a custom overshoot amount.
 *
 * @remarks
 * Back curves pull slightly PAST the target and come back — the
 * anticipation that makes an entrance feel deliberate. Use the ready-made
 * {@link easeInBack} / {@link easeOutBack} / {@link easeInOutBack} unless
 * you specifically want a different amount of overshoot.
 *
 * @param s - Overshoot amount; larger goes further past the target.
 * @defaultValue `1.70158` — the canonical ~10% overshoot
 * @returns A {@link TimingFunction} to pass to any animator.
 *
 * @example
 * ```typescript
 * const subtle = Timing.createEaseOutBack(0.7);
 * yield* card.pipe(Motion.moveTo({ y: 100 }, "600 millis", subtle));
 * ```
 */
export const createEaseInBack =
	(s = 1.70158): TimingFunction =>
	(t) =>
		(s + 1) * t ** 3 - s * t ** 2;

export const createEaseOutBack =
	(s = 1.70158): TimingFunction =>
	(t) =>
		1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;

export const createEaseInOutBack = (s = 1.70158, v = 1.525): TimingFunction => {
	const c = s * v;
	return (t) =>
		t < 0.5
			? ((2 * t) ** 2 * ((c + 1) * 2 * t - c)) / 2
			: ((2 * t - 2) ** 2 * ((c + 1) * (2 * t - 2) + c) + 2) / 2;
};

/**
 * Build an Elastic easing with a custom oscillation frequency.
 *
 * @remarks
 * Elastic curves overshoot and ring like a plucked string before settling.
 * Prefer {@link easeInElastic} / {@link easeOutElastic} /
 * {@link easeInOutElastic} unless you want a different wobble rate.
 *
 * @param s - Angular frequency; higher oscillates more times.
 * @defaultValue `2.094395` (2π/3)
 * @returns A {@link TimingFunction} to pass to any animator.
 */
export const createEaseInElastic =
	(s = 2.094395): TimingFunction =>
	(t) =>
		t === 0
			? 0
			: t === 1
				? 1
				: -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * s);

export const createEaseOutElastic =
	(s = 2.094395): TimingFunction =>
	(t) =>
		t === 0
			? 0
			: t === 1
				? 1
				: 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * s) + 1;

/**
 * Build an in-out Elastic easing with a custom oscillation frequency.
 *
 * @param s - Angular frequency; higher oscillates more times.
 * @defaultValue `1.39626` (2π/4.5)
 * @returns A {@link TimingFunction} to pass to any animator.
 */
export const createEaseInOutElastic =
	(s = 1.39626): TimingFunction =>
	(t) =>
		t === 0
			? 0
			: t === 1
				? 1
				: t < 0.5
					? -(2 ** (20 * t - 10) * Math.sin((20 * t - 11.125) * s)) / 2
					: (2 ** (-20 * t + 10) * Math.sin((20 * t - 11.125) * s)) / 2 + 1;

/**
 * Build a Bounce easing with custom stiffness and bounce spacing.
 *
 * @remarks
 * Bounce curves imitate a ball hitting a surface: a series of ever-smaller
 * rebounds. Unlike Elastic, they never go PAST the target — they arrive and
 * rebound away from it. Prefer {@link easeOutBounce} and its siblings unless
 * tuning the character.
 *
 * The offsets are derived from the parameters, so f(1) = 1 holds for any
 * stiffness and a tween still lands exactly.
 *
 * @param n - Bounce stiffness.
 * @param d - Interval divisor, setting how the bounces are spaced.
 * @defaultValue `n` — `7.5625`; `d` — `2.75` (the canonical CSS bounce)
 * @returns A {@link TimingFunction} to pass to any animator.
 */
export const createEaseOutBounce = (n = 7.5625, d = 2.75): TimingFunction => {
	// segment offsets derived from the parameters so f(1) = 1 holds for
	// any stiffness (defaults yield the canonical 0.75/0.9375/0.984375)
	const o1 = 1 - n * (0.5 / d) ** 2;
	const o2 = 1 - n * (0.25 / d) ** 2;
	const o3 = 1 - n * (1 - 2.625 / d) ** 2;
	return (t) => {
		if (t < 1 / d) {
			return n * t ** 2;
		}
		if (t < 2 / d) {
			const u = t - 1.5 / d;
			return n * u ** 2 + o1;
		}
		if (t < 2.5 / d) {
			const u = t - 2.25 / d;
			return n * u ** 2 + o2;
		}
		const u = t - 2.625 / d;
		return n * u ** 2 + o3;
	};
};

export const createEaseInBounce = (n = 7.5625, d = 2.75): TimingFunction => {
	const out = createEaseOutBounce(n, d);
	return (t) => 1 - out(1 - t);
};

export const createEaseInOutBounce = (n = 7.5625, d = 2.75): TimingFunction => {
	const out = createEaseOutBounce(n, d);
	return (t) => (t < 0.5 ? (1 - out(1 - 2 * t)) / 2 : (1 + out(2 * t - 1)) / 2);
};

/**
 * The ready-made overshoot and oscillation curves, at their canonical
 * parameters — `Back` anticipates past the target, `Elastic` rings like a
 * string, `Bounce` rebounds like a dropped ball.
 *
 * @remarks
 * These are how you get spring-LIKE character in a fixed, known duration.
 * For real physics whose length emerges from the simulation, use `Physics`.
 *
 * @see {@link createEaseInBack}, {@link createEaseInElastic},
 *   {@link createEaseOutBounce} to tune the parameters.
 */
export const easeInBack = createEaseInBack();
export const easeOutBack = createEaseOutBack();
export const easeInOutBack = createEaseInOutBack();
export const easeInElastic = createEaseInElastic();
export const easeOutElastic = createEaseOutElastic();
export const easeInOutElastic = createEaseInOutElastic();
export const easeInBounce = createEaseInBounce();
export const easeOutBounce = createEaseOutBounce();
export const easeInOutBounce = createEaseInOutBounce();

/**
 * Every built-in easing, by name — the lookup behind the string form.
 *
 * @remarks
 * You rarely touch this directly: passing `"easeOutCubic"` to an animator
 * resolves through it. Useful for building a curve picker, or iterating the
 * whole set.
 */
export const timingFunctions = {
	linear,
	sin,
	cos,
	easeInSine,
	easeOutSine,
	easeInOutSine,
	easeInQuad,
	easeOutQuad,
	easeInOutQuad,
	easeInCubic,
	easeOutCubic,
	easeInOutCubic,
	easeInQuart,
	easeOutQuart,
	easeInOutQuart,
	easeInQuint,
	easeOutQuint,
	easeInOutQuint,
	easeInExpo,
	easeOutExpo,
	easeInOutExpo,
	easeInCirc,
	easeOutCirc,
	easeInOutCirc,
	easeInBack,
	easeOutBack,
	easeInOutBack,
	easeInElastic,
	easeOutElastic,
	easeInOutElastic,
	easeInBounce,
	easeOutBounce,
	easeInOutBounce,
} as const;

/** The name of a built-in easing — what animators autocomplete. */
export type TimingFunctionName = keyof typeof timingFunctions;

/**
 * What animators accept for pacing: a built-in easing name, or your own
 * `(t: number) => number`.
 */
export type TimingInput = TimingFunctionName | TimingFunction;

export const resolve = (input: TimingInput): TimingFunction => {
	if (typeof input === "function") {
		return input;
	}
	const fn = timingFunctions[input];
	if (fn === undefined) {
		// unreachable for typed consumers; catches plain-JS typos
		throw new Error(`Timing: unknown timing function "${String(input)}"`);
	}
	return fn;
};
