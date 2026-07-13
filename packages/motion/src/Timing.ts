/**
 * Timing (easing) functions: map linear progress t in [0, 1] to eased
 * progress. Every non-periodic easing satisfies f(0) = 0 and f(1) = 1,
 * so tweens land exactly on their target. `sin`/`cos` are periodic
 * helpers over one full cycle and deliberately do NOT end at 1.
 * Back/Elastic curves overshoot outside [0, 1] mid-animation by design —
 * consumers must extrapolate, not clamp.
 */
export type TimingFunction = (t: number) => number;

export const linear: TimingFunction = (t) => t;

/** one full sine cycle: 0 → 1 → 0 */
export const sin: TimingFunction = (t) => (1 - Math.cos(2 * Math.PI * t)) / 2;

/** one full cosine cycle: 1 → 0 → 1 */
export const cos: TimingFunction = (t) => (1 + Math.cos(2 * Math.PI * t)) / 2;

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

export const easeInCirc: TimingFunction = (t) => 1 - Math.sqrt(1 - t ** 2);
export const easeOutCirc: TimingFunction = (t) => Math.sqrt(1 - (t - 1) ** 2);
export const easeInOutCirc: TimingFunction = (t) =>
	t < 0.5
		? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2
		: (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2;

/** `s` is the overshoot amount */
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

/** `s` is the angular frequency (default 2π/3) */
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

/** `s` is the angular frequency (default 2π/4.5) */
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

/** `n` is the bounce stiffness, `d` the interval divisor */
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

export const easeInBack = createEaseInBack();
export const easeOutBack = createEaseOutBack();
export const easeInOutBack = createEaseInOutBack();
export const easeInElastic = createEaseInElastic();
export const easeOutElastic = createEaseOutElastic();
export const easeInOutElastic = createEaseInOutElastic();
export const easeInBounce = createEaseInBounce();
export const easeOutBounce = createEaseOutBounce();
export const easeInOutBounce = createEaseInOutBounce();

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

export type TimingFunctionName = keyof typeof timingFunctions;

/** a built-in name (autocompleted) or a custom timing function */
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
