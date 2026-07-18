import chroma from "chroma-js";
import { Schema } from "effect";
import * as Function from "effect/Function";
import * as Pipeable from "effect/Pipeable";

const clamp = (value: number, minimum: number, maximum: number) =>
	Math.min(Math.max(value, minimum), maximum);

export type InterpolationMode = chroma.InterpolationMode;

export class Color
	extends Schema.TaggedClass<Color>()("Color", {
		"~r": Schema.Number,
		"~g": Schema.Number,
		"~b": Schema.Number,
		"~a": Schema.Number,
	})
	implements Pipeable.Pipeable
{
	static of(r: number, g: number, b: number, a?: number) {
		return new Color({
			"~r": clamp(r, 0, 255),
			"~g": clamp(g, 0, 255),
			"~b": clamp(b, 0, 255),
			"~a": clamp(a ?? 1, 0, 1),
		});
	}
	get r() {
		return clamp(this["~r"], 0, 255);
	}

	get g() {
		return clamp(this["~g"], 0, 255);
	}
	get b() {
		return clamp(this["~b"], 0, 255);
	}
	get a() {
		return clamp(this["~a"], 0, 1);
	}

	pipe: Pipeable.Pipeable["pipe"] = (
		..._fns: ReadonlyArray<(value: Color) => Color>
	) => {
		return Pipeable.pipeArguments(this, _fns as never);
	};
}

const toChroma = (color: Color) => {
	return chroma.rgb(color["~r"], color["~g"], color["~b"], color["~a"]);
};

const fromChroma = (color: chroma.Color) => {
	return new Color({
		"~r": color._rgb._unclipped[0],
		"~g": color._rgb._unclipped[1],
		"~b": color._rgb._unclipped[2],
		"~a": color._rgb._unclipped[3],
	});
};
export const is = (value: unknown): value is Color => {
	return value instanceof Color;
};
export const rgba = (r: number, g: number, b: number, alpha?: number) =>
	Color.of(r, g, b, alpha);

/** Parse a CSS color string (`#rgb`, `#rrggbb`, `#rrggbbaa`, named, `rgb()`, …). */
export const hex = (value: string) => {
	const c = chroma(value);
	const [r, g, b] = c.rgb();
	return Color.of(r, g, b, c.alpha());
};

export const hsl = (h: number, s: number, l: number, alpha?: number) => {
	const rgb = chroma.hsl(h, s, l, alpha);
	return Color.of(
		rgb._rgb._unclipped[0],
		rgb._rgb._unclipped[1],
		rgb._rgb._unclipped[2],
		rgb._rgb._unclipped[3],
	);
};
export const hsv = (h: number, s: number, v: number, alpha?: number) => {
	const rgb = chroma.hsv(h, s, v, alpha);
	return Color.of(
		rgb._rgb._unclipped[0],
		rgb._rgb._unclipped[1],
		rgb._rgb._unclipped[2],
		rgb._rgb._unclipped[3],
	);
};

export const lab = (l: number, a: number, b: number, alpha?: number) => {
	const rgb = chroma.lab(l, a, b, alpha);
	return Color.of(
		rgb._rgb._unclipped[0],
		rgb._rgb._unclipped[1],
		rgb._rgb._unclipped[2],
		rgb._rgb._unclipped[3],
	);
};

export const lch = (l: number, c: number, h: number, a?: number) => {
	const rgb = chroma.lch(l, c, h, a);
	return Color.of(
		rgb._rgb._unclipped[0],
		rgb._rgb._unclipped[1],
		rgb._rgb._unclipped[2],
		rgb._rgb._unclipped[3],
	);
};
export const hcl = (h: number, c: number, l: number, a?: number) => {
	const rgb = chroma.hcl(h, c, l, a);
	return Color.of(
		rgb._rgb._unclipped[0],
		rgb._rgb._unclipped[1],
		rgb._rgb._unclipped[2],
		rgb._rgb._unclipped[3],
	);
};
export const oklab = (l: number, a: number, b: number, alpha?: number) => {
	const rgb = chroma.oklab(l, a, b, alpha);
	return Color.of(
		rgb._rgb._unclipped[0],
		rgb._rgb._unclipped[1],
		rgb._rgb._unclipped[2],
		rgb._rgb._unclipped[3],
	);
};
export const oklch = (l: number, c: number, h: number, alpha?: number) => {
	const rgb = chroma.oklch(l, c, h, alpha);
	return Color.of(
		rgb._rgb._unclipped[0],
		rgb._rgb._unclipped[1],
		rgb._rgb._unclipped[2],
		rgb._rgb._unclipped[3],
	);
};
export const cmyk = (c: number, m: number, y: number, k: number) => {
	const rgb = chroma.cmyk(c, m, y, k);
	return Color.of(
		rgb._rgb._unclipped[0],
		rgb._rgb._unclipped[1],
		rgb._rgb._unclipped[2],
		rgb._rgb._unclipped[3],
	);
};
export const gl = (g: number, l: number, r: number, alpha?: number) => {
	const rgb = chroma.gl(g, l, r, alpha);
	return Color.of(
		rgb._rgb._unclipped[0],
		rgb._rgb._unclipped[1],
		rgb._rgb._unclipped[2],
		rgb._rgb._unclipped[3],
	);
};
const secondIsColor = (args: IArguments) => is(args[1]);
const firstIsColor = (args: IArguments) => is(args[0]);

export const alpha = Function.dual<
	(amount: number) => (self: Color) => Color,
	(self: Color, amount: number) => Color
>(firstIsColor, (self, amount) => {
	return new Color({
		"~r": self["~r"],
		"~g": self["~g"],
		"~b": self["~b"],
		"~a": amount,
	});
});

export const darken = Function.dual<
	(amount?: number) => (self: Color) => Color,
	(self: Color, amount?: number) => Color
>(firstIsColor, (self, amount) => {
	return fromChroma(toChroma(self).darken(amount));
});
export const brighten = Function.dual<
	(amount?: number) => (self: Color) => Color,
	(self: Color, amount?: number) => Color
>(firstIsColor, (self, amount) => {
	return fromChroma(toChroma(self).brighten(amount));
});

export const saturate = Function.dual<
	(amount?: number) => (self: Color) => Color,
	(self: Color, amount?: number) => Color
>(firstIsColor, (self, amount) => {
	return fromChroma(toChroma(self).saturate(amount));
});

export const desaturate = Function.dual<
	(amount?: number) => (self: Color) => Color,
	(self: Color, amount?: number) => Color
>(firstIsColor, (self, amount) => {
	return fromChroma(toChroma(self).desaturate(amount));
});

export type ChannelMap = {
	rgb: "r" | "g" | "b";
	lrgb: "r" | "g" | "b";
	lab: "l" | "a" | "b";
	lch: "l" | "c" | "h";
	hcl: "h" | "c" | "l";
	num: "h" | "s" | "l";
	hcg: "h" | "c" | "g";
	hsi: "h" | "s" | "i";
	hsl: "h" | "s" | "l";
	hsv: "h" | "s" | "v";
	oklab: "l" | "a" | "b";
	oklch: "l" | "c" | "h";
};
export const mix = Function.dual<
	(
		color: Color,
		amount: number,
		mode?: chroma.InterpolationMode,
	) => (self: Color) => Color,
	(
		self: Color,
		color: Color,
		amount: number,
		mode?: chroma.InterpolationMode,
	) => Color
>(secondIsColor, (self, color, amount, mode) => {
	const colorMix = chroma.mix(toChroma(self), toChroma(color), amount, mode);

	return fromChroma(colorMix);
});

export const shade = Function.dual<
	(amount?: number, mode?: chroma.InterpolationMode) => (self: Color) => Color,
	(self: Color, amount?: number, mode?: chroma.InterpolationMode) => Color
>(firstIsColor, (self, amount, mode) => {
	return fromChroma(toChroma(self).shade(amount, mode));
});

export const tint = Function.dual<
	(amount?: number, mode?: chroma.InterpolationMode) => (self: Color) => Color,
	(self: Color, amount?: number, mode?: chroma.InterpolationMode) => Color
>(firstIsColor, (self, amount, mode) => {
	return fromChroma(toChroma(self).tint(amount, mode));
});

export type Value =
	| number
	| `*${number}`
	| `+${number}`
	| `-${number}`
	| `/${number}`;
export const set = Function.dual<
	<T extends keyof ChannelMap>(
		format: T,
		channel: ChannelMap[T],
		amount: Value,
	) => (self: Color) => Color,
	<T extends keyof ChannelMap>(
		self: Color,
		format: T,
		channel: ChannelMap[T],
		amount: Value,
	) => Color
>(firstIsColor, (self, format, channel, amount) => {
	return fromChroma(toChroma(self).set(`${format}.${channel}`, amount));
});

export const get = Function.dual<
	<T extends keyof ChannelMap>(
		format: T,
		channel: ChannelMap[T],
	) => (self: Color) => number,
	<T extends keyof ChannelMap>(
		self: Color,
		format: T,
		channel: ChannelMap[T],
	) => number
>(firstIsColor, (self, format, channel) => {
	return toChroma(self).get(`${format}.${channel}`);
});

export const luminance = (self: Color) => {
	return toChroma(self).luminance();
};
export const temperature = (self: Color) => {
	return toChroma(self).temperature();
};

export const contrast = Function.dual<
	(color: Color) => (self: Color) => number,
	(self: Color, color: Color) => number
>(secondIsColor, (self, color) => {
	return chroma.contrast(toChroma(self), toChroma(color));
});

export const contrastAPCA = Function.dual<
	(color: Color) => (self: Color) => number,
	(self: Color, color: Color) => number
>(secondIsColor, (self, color) => {
	return chroma.contrastAPCA(toChroma(self), toChroma(color));
});

export const distance = Function.dual<
	(color: Color, format?: chroma.ColorFormat) => (self: Color) => number,
	(self: Color, color: Color, format?: chroma.ColorFormat) => number
>(secondIsColor, (self, color, format) => {
	return chroma.distance(toChroma(self), toChroma(color), format);
});

export const deltaE = Function.dual<
	(
		color: Color,
		kl?: number,
		kc?: number,
		kh?: number,
	) => (self: Color) => number,
	(self: Color, color: Color, kl?: number, kc?: number, kh?: number) => number
>(secondIsColor, (self, color, kl, kc, kh) => {
	return chroma.deltaE(toChroma(self), toChroma(color), kl, kc, kh);
});

export const toHex = (self: Color) => {
	return toChroma(self).hex();
};

export const toRgb = (self: Color) => {
	return toChroma(self).rgb();
};

export const toHsl = (self: Color) => {
	return toChroma(self).hsl();
};

export const toHsv = (self: Color) => {
	return toChroma(self).hsv();
};

export const toOklab = (self: Color) => {
	return toChroma(self).oklab();
};

export const toOklch = (self: Color) => {
	return toChroma(self).oklch();
};

export const toNum = (self: Color) => {
	return toChroma(self).num();
};

export type BlendMode =
	| "multiply"
	| "darken"
	| "lighten"
	| "screen"
	| "overlay"
	| "burn"
	| "dodge";
export const blend = Function.dual<
	(color: Color, mode: BlendMode) => (self: Color) => Color,
	(self: Color, color: Color, mode: BlendMode) => Color
>(secondIsColor, (self, color, mode) => {
	return fromChroma(chroma.blend(toChroma(self), toChroma(color), mode));
});

/**
 * RGBA as 0–255 bytes — the form ThorVG's setFillColor/setStrokeColor want.
 * `a` is scaled from the 0–1 alpha, so this is the single conversion point
 * for the raster boundary (the getters keep alpha 0–1 for authoring math).
 */
export const bytes = (self: Color) => ({
	r: Math.round(self.r),
	g: Math.round(self.g),
	b: Math.round(self.b),
	a: Math.round(self.a * 255),
});

export const black = rgba(0, 0, 0, 1);
export const white = rgba(255, 255, 255, 1);

export const transparent = rgba(0, 0, 0, 0);

export const twMap = {
	slate: {
		"50": oklch(0.977, 0.017, 320.058),
		"100": oklch(0.952, 0.037, 318.852),
		"200": oklch(0.903, 0.076, 319.62),
		"300": oklch(0.833, 0.145, 321.434),
		"400": oklch(0.74, 0.238, 322.16),
		"500": oklch(0.667, 0.295, 322.15),
		"600": oklch(0.591, 0.293, 322.896),
		"700": oklch(0.518, 0.253, 323.949),
		"800": oklch(0.452, 0.211, 324.591),
		"900": oklch(0.401, 0.17, 325.612),
		"950": oklch(0.293, 0.136, 325.661),
	},
	gray: {
		"50": oklch(0.985, 0, 247.839),
		"100": oklch(0.967, 0.003, 264.542),
		"200": oklch(0.928, 0.006, 264.531),
		"300": oklch(0.872, 0.01, 258.338),
		"400": oklch(Math.SQRT1_2, 0.022, 261.325),
		"500": oklch(0.551, 0.027, 264.364),
		"600": oklch(0.446, 0.03, 256.802),
		"700": oklch(0.373, 0.034, 259.733),
		"800": oklch(0.278, 0.033, 256.848),
		"900": oklch(0.21, 0.034, 264.665),
		"950": oklch(0.13, 0.028, 261.692),
	},
	zinc: {
		"50": oklch(0.985, 0, 0),
		"100": oklch(0.967, 0.001, 286.375),
		"200": oklch(0.92, 0.004, 286.32),
		"300": oklch(0.871, 0.006, 286.286),
		"400": oklch(0.705, 0.015, 286.067),
		"500": oklch(0.552, 0.016, 285.938),
		"600": oklch(0.442, 0.017, 285.786),
		"700": oklch(0.37, 0.013, 285.805),
		"800": oklch(0.274, 0.006, 286.033),
		"900": oklch(0.21, 0.006, 285.885),
		"950": oklch(0.141, 0.005, 285.823),
	},
	neutral: {
		"50": oklch(0.985, 0, 0),
		"100": oklch(0.97, 0, 0),
		"200": oklch(0.922, 0, 0),
		"300": oklch(0.87, 0, 0),
		"400": oklch(0.708, 0, 0),
		"500": oklch(0.556, 0, 0),
		"600": oklch(0.439, 0, 0),
		"700": oklch(0.371, 0, 0),
		"800": oklch(0.269, 0, 0),
		"900": oklch(0.205, 0, 0),
		"950": oklch(0.145, 0, 0),
	},
	stone: {
		"50": oklch(0.985, 0.001, 106.423),
		"100": oklch(0.97, 0.001, 106.424),
		"200": oklch(0.923, 0.003, 48.717),
		"300": oklch(0.869, 0.005, 56.366),
		"400": oklch(0.709, 0.01, 56.259),
		"500": oklch(0.553, 0.013, 58.071),
		"600": oklch(0.444, 0.011, 73.639),
		"700": oklch(0.374, 0.01, 67.558),
		"800": oklch(0.268, 0.007, 34.298),
		"900": oklch(0.216, 0.006, 56.043),
		"950": oklch(0.147, 0.004, 49.25),
	},
	mauve: {
		"50": oklch(0.985, 0, 0),
		"100": oklch(0.96, 0.003, 325.6),
		"200": oklch(0.922, 0.005, 325.62),
		"300": oklch(0.865, 0.012, 325.68),
		"400": oklch(0.711, 0.019, 323.02),
		"500": oklch(0.542, 0.034, 322.5),
		"600": oklch(0.435, 0.029, 321.78),
		"700": oklch(0.364, 0.029, 323.89),
		"800": oklch(0.263, 0.024, 320.12),
		"900": oklch(0.212, 0.019, 322.12),
		"950": oklch(0.145, 0.008, 326),
	},
	olive: {
		"50": oklch(0.988, 0.003, 106.5),
		"100": oklch(0.966, 0.005, 106.5),
		"200": oklch(0.93, 0.007, 106.5),
		"300": oklch(0.88, 0.011, 106.6),
		"400": oklch(0.737, 0.021, 106.9),
		"500": oklch(0.58, 0.031, 107.3),
		"600": oklch(0.466, 0.025, 107.3),
		"700": oklch(0.394, 0.023, 107.4),
		"800": oklch(0.286, 0.016, 107.4),
		"900": oklch(0.228, 0.013, 107.4),
		"950": oklch(0.153, 0.006, 107.1),
	},
	mist: {
		"50": oklch(0.987, 0.002, 197.1),
		"100": oklch(0.963, 0.002, 197.1),
		"200": oklch(0.925, 0.005, 214.3),
		"300": oklch(0.872, 0.007, 219.6),
		"400": oklch(0.723, 0.014, 214.4),
		"500": oklch(0.56, 0.021, 213.5),
		"600": oklch(0.45, 0.017, 213.2),
		"700": oklch(0.378, 0.015, 216),
		"800": oklch(0.275, 0.011, 216.9),
		"900": oklch(0.218, 0.008, 223.9),
		"950": oklch(0.148, 0.004, 228.8),
	},
	taupe: {
		"50": oklch(0.986, 0.002, 67.8),
		"100": oklch(0.96, 0.002, 17.2),
		"200": oklch(0.922, 0.005, 34.3),
		"300": oklch(0.868, 0.007, 39.5),
		"400": oklch(0.714, 0.014, 41.2),
		"500": oklch(0.547, 0.021, 43.1),
		"600": oklch(0.438, 0.017, 39.3),
		"700": oklch(0.367, 0.016, 35.7),
		"800": oklch(0.268, 0.011, 36.5),
		"900": oklch(0.214, 0.009, 43.1),
		"950": oklch(0.147, 0.004, 49.3),
	},
	red: {
		"50": oklch(0.971, 0.013, 17.38),
		"100": oklch(0.936, 0.032, 17.717),
		"200": oklch(0.885, 0.062, 18.334),
		"300": oklch(0.808, 0.114, 19.571),
		"400": oklch(0.704, 0.191, 22.216),
		"500": oklch(0.637, 0.237, 25.331),
		"600": oklch(0.577, 0.245, 27.325),
		"700": oklch(0.505, 0.213, 27.518),
		"800": oklch(0.444, 0.177, 26.899),
		"900": oklch(0.396, 0.141, 25.723),
		"950": oklch(0.258, 0.092, 26.042),
	},
	orange: {
		"50": oklch(0.98, 0.016, 73.684),
		"100": oklch(0.954, 0.038, 75.164),
		"200": oklch(0.901, 0.076, 70.697),
		"300": oklch(0.837, 0.128, 66.29),
		"400": oklch(0.75, 0.183, 55.934),
		"500": oklch(0.705, 0.213, 47.604),
		"600": oklch(0.646, 0.222, 41.116),
		"700": oklch(0.553, 0.195, 38.402),
		"800": oklch(0.47, 0.157, 37.304),
		"900": oklch(0.408, 0.123, 38.172),
		"950": oklch(0.266, 0.079, 36.259),
	},
	amber: {
		"50": oklch(0.987, 0.022, 95.277),
		"100": oklch(0.962, 0.059, 95.617),
		"200": oklch(0.924, 0.12, 95.746),
		"300": oklch(0.879, 0.169, 91.605),
		"400": oklch(0.828, 0.189, 84.429),
		"500": oklch(0.769, 0.188, 70.08),
		"600": oklch(0.666, 0.179, 58.318),
		"700": oklch(0.555, 0.163, 48.998),
		"800": oklch(0.473, 0.137, 46.201),
		"900": oklch(0.414, 0.112, 45.904),
		"950": oklch(0.279, 0.077, 45.635),
	},

	yellow: {
		"50": oklch(0.987, 0.026, 102.212),
		"100": oklch(0.973, 0.071, 103.193),
		"200": oklch(0.945, 0.129, 101.54),
		"300": oklch(0.905, 0.182, 98.111),
		"400": oklch(0.852, 0.199, 91.936),
		"500": oklch(0.795, 0.184, 86.047),
		"600": oklch(0.681, 0.162, 75.834),
		"700": oklch(0.554, 0.135, 66.442),
		"800": oklch(0.476, 0.114, 61.907),
		"900": oklch(0.421, 0.095, 57.708),
		"950": oklch(0.286, 0.066, 53.813),
	},
	lime: {
		"50": oklch(0.986, 0.031, 120.757),
		"100": oklch(0.967, 0.067, 122.328),
		"200": oklch(0.938, 0.127, 124.321),
		"300": oklch(0.897, 0.196, 126.665),
		"400": oklch(0.841, 0.238, 128.85),
		"500": oklch(0.768, 0.233, 130.85),
		"600": oklch(0.648, 0.2, 131.684),
		"700": oklch(0.532, 0.157, 131.589),
		"800": oklch(0.453, 0.124, 130.933),
		"900": oklch(0.405, 0.101, 131.063),
		"950": oklch(0.274, 0.072, 132.109),
	},
	green: {
		"50": oklch(0.982, 0.018, 155.826),
		"100": oklch(0.962, 0.044, 156.743),
		"200": oklch(0.925, 0.084, 155.995),
		"300": oklch(0.871, 0.15, 154.449),
		"400": oklch(0.792, 0.209, 151.711),
		"500": oklch(0.723, 0.219, 149.579),
		"600": oklch(0.627, 0.194, 149.214),
		"700": oklch(0.527, 0.154, 150.069),
		"800": oklch(0.448, 0.119, 151.328),
		"900": oklch(0.393, 0.095, 152.535),
		"950": oklch(0.266, 0.065, 152.934),
	},
	emerald: {
		"50": oklch(0.979, 0.021, 166.113),
		"100": oklch(0.95, 0.052, 163.051),
		"200": oklch(0.905, 0.093, 164.15),
		"300": oklch(0.845, 0.143, 164.978),
		"400": oklch(0.765, 0.177, 163.223),
		"500": oklch(0.696, 0.17, 162.48),
		"600": oklch(0.596, 0.145, 163.225),
		"700": oklch(0.508, 0.118, 165.612),
		"800": oklch(0.432, 0.095, 166.913),
		"900": oklch(0.378, 0.077, 168.94),
		"950": oklch(0.262, 0.051, 172.552),
	},
	teal: {
		"50": oklch(0.984, 0.014, 180.72),
		"100": oklch(0.953, 0.051, 180.801),
		"200": oklch(0.91, 0.096, 180.426),
		"300": oklch(0.855, 0.138, 181.071),
		"400": oklch(0.777, 0.152, 181.912),
		"500": oklch(0.704, 0.14, 182.503),
		"600": oklch(0.6, 0.118, 184.704),
		"700": oklch(0.511, 0.096, 186.391),
		"800": oklch(0.437, 0.078, 188.216),
		"900": oklch(0.386, 0.063, 188.416),
		"950": oklch(0.277, 0.046, 192.524),
	},
	cyan: {
		"50": oklch(0.984, 0.019, 200.873),
		"100": oklch(0.956, 0.045, 203.388),
		"200": oklch(0.917, 0.08, 205.041),
		"300": oklch(0.865, 0.127, 207.078),
		"400": oklch(0.789, 0.154, 211.53),
		"500": oklch(0.715, 0.143, 215.221),
		"600": oklch(0.609, 0.126, 221.723),
		"700": oklch(0.52, 0.105, 223.128),
		"800": oklch(0.45, 0.085, 224.283),
		"900": oklch(0.398, 0.07, 227.392),
		"950": oklch(0.302, 0.056, 229.695),
	},
	sky: {
		"50": oklch(0.977, 0.013, 236.62),
		"100": oklch(0.951, 0.026, 236.824),
		"200": oklch(0.901, 0.058, 230.902),
		"300": oklch(0.828, 0.111, 230.318),
		"400": oklch(0.746, 0.16, 232.661),
		"500": oklch(0.685, 0.169, 237.323),
		"600": oklch(0.588, 0.158, 241.966),
		"700": oklch(0.5, 0.134, 242.749),
		"800": oklch(0.443, 0.11, 240.79),
		"900": oklch(0.391, 0.09, 240.876),
		"950": oklch(0.293, 0.066, 243.157),
	},
	blue: {
		"50": oklch(0.97, 0.014, 254.604),
		"100": oklch(0.932, 0.032, 255.585),
		"200": oklch(0.882, 0.059, 254.128),
		"300": oklch(0.809, 0.105, 251.813),
		"400": oklch(Math.SQRT1_2, 0.165, 254.624),
		"500": oklch(0.623, 0.214, 259.815),
		"600": oklch(0.546, 0.245, 262.881),
		"700": oklch(0.488, 0.243, 264.376),
		"800": oklch(0.424, 0.199, 265.638),
		"900": oklch(0.379, 0.146, 265.522),
		"950": oklch(0.282, 0.091, 267.935),
	},
	indigo: {
		"50": oklch(0.962, 0.018, 272.314),
		"100": oklch(0.93, 0.034, 272.788),
		"200": oklch(0.87, 0.065, 274.039),
		"300": oklch(0.785, 0.115, 274.713),
		"400": oklch(0.673, 0.182, 276.935),
		"500": oklch(0.585, 0.233, 277.117),
		"600": oklch(0.511, 0.262, 276.966),
		"700": oklch(0.457, 0.24, 277.023),
		"800": oklch(0.398, 0.195, 277.366),
		"900": oklch(0.359, 0.144, 278.697),
		"950": oklch(0.257, 0.09, 281.288),
	},
	violet: {
		"50": oklch(0.969, 0.016, 293.756),
		"100": oklch(0.943, 0.029, 294.588),
		"200": oklch(0.894, 0.057, 293.283),
		"300": oklch(0.811, 0.111, 293.571),
		"400": oklch(0.702, 0.183, 293.541),
		"500": oklch(0.606, 0.25, 292.717),
		"600": oklch(0.541, 0.281, 293.009),
		"700": oklch(0.491, 0.27, 292.581),
		"800": oklch(0.432, 0.232, 292.759),
		"900": oklch(0.38, 0.189, 293.745),
		"950": oklch(0.283, 0.141, 291.089),
	},
	purple: {
		"50": oklch(0.977, 0.014, 308.299),
		"100": oklch(0.946, 0.033, 307.174),
		"200": oklch(0.902, 0.063, 306.703),
		"300": oklch(0.827, 0.119, 306.383),
		"400": oklch(0.714, 0.203, 305.504),
		"500": oklch(0.627, 0.265, 303.9),
		"600": oklch(0.558, 0.288, 302.321),
		"700": oklch(0.496, 0.265, 301.924),
		"800": oklch(0.438, 0.218, 303.724),
		"900": oklch(0.381, 0.176, 304.987),
		"950": oklch(0.291, 0.149, 302.717),
	},
	fuchsia: {
		"50": oklch(0.977, 0.017, 320.058),
		"100": oklch(0.952, 0.037, 318.852),
		"200": oklch(0.903, 0.076, 319.62),
		"300": oklch(0.833, 0.145, 321.434),
		"400": oklch(0.74, 0.238, 322.16),
		"500": oklch(0.667, 0.295, 322.15),
		"600": oklch(0.591, 0.293, 322.896),
		"700": oklch(0.518, 0.253, 323.949),
		"800": oklch(0.452, 0.211, 324.591),
		"900": oklch(0.401, 0.17, 325.612),
		"950": oklch(0.293, 0.136, 325.661),
	},
	pink: {
		"50": oklch(0.971, 0.014, 343.198),
		"100": oklch(0.948, 0.028, 342.258),
		"200": oklch(0.899, 0.061, 343.231),
		"300": oklch(0.823, 0.12, 346.018),
		"400": oklch(0.718, 0.202, 349.761),
		"500": oklch(0.656, 0.241, 354.308),
		"600": oklch(0.592, 0.249, 0.584),
		"700": oklch(0.525, 0.223, 3.958),
		"800": oklch(0.459, 0.187, 3.815),
		"900": oklch(0.408, 0.153, 2.432),
		"950": oklch(0.284, 0.109, 3.907),
	},
	rose: {
		"50": oklch(0.969, 0.015, 12.422),
		"100": oklch(0.941, 0.03, 12.58),
		"200": oklch(0.892, 0.058, 10.001),
		"300": oklch(0.81, 0.117, 11.638),
		"400": oklch(0.712, 0.194, 13.428),
		"500": oklch(0.645, 0.246, 16.439),
		"600": oklch(0.586, 0.253, 17.585),
		"700": oklch(0.514, 0.222, 16.935),
		"800": oklch(0.455, 0.188, 13.697),
		"900": oklch(0.41, 0.159, 10.272),
		"950": oklch(0.271, 0.105, 12.094),
	},
} as const;

type TwColor = keyof typeof twMap;
export const tw = (
	color: TwColor,
	shade:
		| "50"
		| "100"
		| "200"
		| "300"
		| "400"
		| "500"
		| "600"
		| "700"
		| "800"
		| "900"
		| "950" = "400",
	alpha: number = 1,
) => {
	const value = twMap[color][shade];
	return new Color({
		"~r": value["~r"],
		"~g": value["~g"],
		"~b": value["~b"],
		"~a": alpha,
	});
};
