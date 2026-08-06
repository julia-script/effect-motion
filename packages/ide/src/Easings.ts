/**
 * The easing catalog — every name `Motion` accepts, described and drawable.
 *
 * @remarks
 * The curves themselves are NOT re-implemented here: `sample` calls the
 * real `effect-motion/Timing` functions, so a preview in the editor is the
 * same arithmetic the renderer runs. Only the prose is local, and
 * `test/easings.test.ts` fails if this catalog and `Timing.timingFunctions`
 * ever disagree about which names exist.
 */

import * as Timing from "effect-motion/Timing";

/** The curve families, in the order the reference docs introduce them. */
export type EasingFamily =
	| "Linear"
	| "Periodic"
	| "Sine"
	| "Quad"
	| "Cubic"
	| "Quart"
	| "Quint"
	| "Expo"
	| "Circ"
	| "Back"
	| "Elastic"
	| "Bounce";

/** Which end of the animation the curve eases. */
export type EasingDirection = "none" | "in" | "out" | "inOut";

export interface Easing {
	readonly name: Timing.TimingFunctionName;
	readonly family: EasingFamily;
	readonly direction: EasingDirection;
	/** One line: what it feels like and when to reach for it. */
	readonly summary: string;
	/** Leaves [0, 1] mid-flight — the overshoot IS the effect. */
	readonly overshoots: boolean;
	/** Returns to where it started instead of landing on the target. */
	readonly periodic: boolean;
}

const entry = (
	name: Timing.TimingFunctionName,
	family: EasingFamily,
	direction: EasingDirection,
	summary: string,
	flags: { overshoots?: boolean; periodic?: boolean } = {},
): Easing => ({
	name,
	family,
	direction,
	summary,
	overshoots: flags.overshoots ?? false,
	periodic: flags.periodic ?? false,
});

const inSummary = (feel: string) =>
	`Slow start, accelerating away — ${feel}. For something LEAVING.`;
const outSummary = (feel: string) =>
	`Fast start, settling in — ${feel}. For something ARRIVING.`;
const inOutSummary = (feel: string) =>
	`Eased at both ends — ${feel}. The default for a move between two resting states.`;

/** Every built-in easing, in `Timing.timingFunctions` order. */
export const easings: ReadonlyArray<Easing> = [
	entry(
		"linear",
		"Linear",
		"none",
		"Constant speed. Right for continuous motion (rotation, scrolling), stiff for anything that starts or stops.",
	),
	entry(
		"sin",
		"Periodic",
		"none",
		"One full sine cycle, 0 → 1 → 0. A there-and-back pulse; it ends where it began.",
		{ periodic: true },
	),
	entry(
		"cos",
		"Periodic",
		"none",
		"One full cosine cycle, 1 → 0 → 1. `sin` phase-shifted: starts far, dips, returns.",
		{ periodic: true },
	),

	entry("easeInSine", "Sine", "in", inSummary("the gentlest family")),
	entry("easeOutSine", "Sine", "out", outSummary("barely-there easing")),
	entry(
		"easeInOutSine",
		"Sine",
		"inOut",
		inOutSummary("the softest of the symmetric curves"),
	),

	entry("easeInQuad", "Quad", "in", inSummary("a mild ramp")),
	entry("easeOutQuad", "Quad", "out", outSummary("a mild settle")),
	entry("easeInOutQuad", "Quad", "inOut", inOutSummary("mild")),

	entry("easeInCubic", "Cubic", "in", inSummary("a firm ramp")),
	entry("easeOutCubic", "Cubic", "out", outSummary("a firm settle")),
	entry(
		"easeInOutCubic",
		"Cubic",
		"inOut",
		inOutSummary("the house default for UI-like moves"),
	),

	entry("easeInQuart", "Quart", "in", inSummary("a strong ramp")),
	entry("easeOutQuart", "Quart", "out", outSummary("a strong settle")),
	entry("easeInOutQuart", "Quart", "inOut", inOutSummary("strong")),

	entry("easeInQuint", "Quint", "in", inSummary("a severe ramp")),
	entry("easeOutQuint", "Quint", "out", outSummary("a severe settle")),
	entry("easeInOutQuint", "Quint", "inOut", inOutSummary("severe")),

	entry("easeInExpo", "Expo", "in", inSummary("almost still, then gone")),
	entry(
		"easeOutExpo",
		"Expo",
		"out",
		outSummary("arrives instantly, then creeps the last pixel"),
	),
	entry(
		"easeInOutExpo",
		"Expo",
		"inOut",
		inOutSummary("the most extreme of the polynomial-like family"),
	),

	entry(
		"easeInCirc",
		"Circ",
		"in",
		inSummary("a quarter-circle: flat, then a wall"),
	),
	entry(
		"easeOutCirc",
		"Circ",
		"out",
		outSummary("a quarter-circle: a wall, then flat"),
	),
	entry(
		"easeInOutCirc",
		"Circ",
		"inOut",
		inOutSummary("sharper near the ends than any Quint"),
	),

	entry(
		"easeInBack",
		"Back",
		"in",
		"Winds up backwards before leaving. Anticipation — the exit reads as intentional.",
		{ overshoots: true },
	),
	entry(
		"easeOutBack",
		"Back",
		"out",
		"Overshoots the target and eases back. The cheapest way to make an entrance feel alive.",
		{ overshoots: true },
	),
	entry(
		"easeInOutBack",
		"Back",
		"inOut",
		"Anticipates on the way out and overshoots on the way in.",
		{ overshoots: true },
	),

	entry(
		"easeInElastic",
		"Elastic",
		"in",
		"Oscillates tighter and tighter, then snaps away. A wound spring released.",
		{ overshoots: true },
	),
	entry(
		"easeOutElastic",
		"Elastic",
		"out",
		"Overshoots and rings down to the target. Spring-LIKE motion in a fixed duration — for real physics use `Physics`.",
		{ overshoots: true },
	),
	entry(
		"easeInOutElastic",
		"Elastic",
		"inOut",
		"Rings at both ends. Loud; use sparingly.",
		{ overshoots: true },
	),

	entry(
		"easeInBounce",
		"Bounce",
		"in",
		"Rebounds toward the start before leaving. Stays inside [0, 1].",
	),
	entry(
		"easeOutBounce",
		"Bounce",
		"out",
		"Lands and rebounds away from the target, settling. Stays inside [0, 1] — it never passes the target.",
	),
	entry(
		"easeInOutBounce",
		"Bounce",
		"inOut",
		"Bounces off both ends. Stays inside [0, 1].",
	),
];

/** Catalog entries by name. */
export const byName: ReadonlyMap<string, Easing> = new Map(
	easings.map((easing) => [easing.name as string, easing]),
);

/** Is `name` a built-in easing? */
export const isEasingName = (name: string): name is Timing.TimingFunctionName =>
	byName.has(name);

/** The catalog entry for a name, or `undefined` for anything else. */
export const find = (name: string): Easing | undefined => byName.get(name);

/**
 * `steps + 1` evenly spaced samples of the real curve, from t = 0 to t = 1
 * inclusive.
 */
export const sample = (
	name: Timing.TimingFunctionName,
	steps = 48,
): ReadonlyArray<number> => {
	const fn = Timing.timingFunctions[name];
	const out: number[] = [];
	for (let i = 0; i <= steps; i++) out.push(fn(i / steps));
	return out;
};

/** Colours a curve preview is drawn with — the caller matches its theme. */
export interface CurveTheme {
	readonly stroke: string;
	readonly guide: string;
	readonly background: string;
}

/** Readable on a dark editor background. */
export const darkTheme: CurveTheme = {
	stroke: "#a48bff",
	guide: "#4a4a55",
	background: "#1e1e24",
};

/** Readable on a light editor background. */
export const lightTheme: CurveTheme = {
	stroke: "#6c3fd8",
	guide: "#c9c9d1",
	background: "#f6f6f8",
};

export interface CurveOptions {
	readonly width?: number;
	readonly height?: number;
	readonly steps?: number;
	readonly theme?: CurveTheme;
	/** Draw the unit box the curve is measured against. Default `true`. */
	readonly guides?: boolean;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Plot samples as standalone SVG markup.
 *
 * @remarks
 * The vertical range is fitted to the samples, so overshooting curves
 * (`Back`, `Elastic`) show their overshoot instead of clipping; the guide
 * box marks where 0 and 1 actually sit.
 */
export const plotSvg = (
	samples: ReadonlyArray<number>,
	options: CurveOptions = {},
): string => {
	const width = options.width ?? 132;
	const height = options.height ?? 84;
	const theme = options.theme ?? darkTheme;
	const guides = options.guides ?? true;
	const pad = 8;

	const lo = Math.min(0, ...samples);
	const hi = Math.max(1, ...samples);
	const span = hi - lo || 1;

	const plotW = width - pad * 2;
	const plotH = height - pad * 2;
	const px = (t: number) => round(pad + t * plotW);
	const py = (v: number) => round(pad + (1 - (v - lo) / span) * plotH);

	const last = samples.length - 1;
	const path = samples
		.map((v, i) => `${i === 0 ? "M" : "L"}${px(i / last)} ${py(v)}`)
		.join(" ");

	const guideMarkup = guides
		? `<rect x="${px(0)}" y="${py(1)}" width="${round(plotW)}" height="${round(
				py(0) - py(1),
			)}" fill="none" stroke="${theme.guide}" stroke-width="1" stroke-dasharray="3 3"/>`
		: "";

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
		`<rect width="${width}" height="${height}" rx="6" fill="${theme.background}"/>`,
		guideMarkup,
		`<path d="${path}" fill="none" stroke="${theme.stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
		"</svg>",
	].join("");
};

/** The SVG for a named easing. */
export const curveSvg = (
	name: Timing.TimingFunctionName,
	options: CurveOptions = {},
): string => plotSvg(sample(name, options.steps ?? 48), options);

/**
 * SVG wrapped as a `data:` URI — what a markdown hover embeds.
 *
 * @remarks
 * Base64, not percent-encoding. Markdown's `![alt](url)` ends the URL at
 * the first space, and SVG attributes are full of them (`stroke-dasharray
 * ="3 3"`), so a percent-encoded payload would have to escape spaces,
 * quotes, `#`, `%`, `<`, `>`, and parentheses correctly to survive — and
 * silently renders as broken alt text when it does not. Base64 has no
 * characters markdown or a URI parser can misread.
 *
 * `btoa` rather than `Buffer`: the plotter is useful in a browser too (the
 * docs site), and the payload is ASCII by construction.
 */
export const toDataUri = (svg: string): string =>
	`data:image/svg+xml;base64,${btoa(svg)}`;
