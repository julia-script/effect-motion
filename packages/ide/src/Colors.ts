/**
 * Finding — and rewriting — effect-motion colour constructors in source
 * text.
 *
 * @remarks
 * This is what puts a swatch beside `Color.hex("#7f5af0")` and lets a
 * colour picker write back into the same call. It is a scanner, not a
 * parser: it walks the text for `<namespace>.<constructor>(` and then
 * balances brackets and string literals to find the argument list. That is
 * enough for literal arguments — which is all a swatch can honestly show —
 * and a call whose arguments are computed is skipped rather than guessed
 * at.
 *
 * Conversions go through `chroma-js`, the same library `effect-motion/Color`
 * uses, so a swatch is the colour the renderer paints.
 */

import chroma from "chroma-js";
import * as Imports from "./Imports.js";
import { twPalette } from "./twPalette.js";

/** The constructors a swatch is offered for. */
export type ColorKind = "hex" | "rgba" | "hsl" | "lab" | "oklch" | "tw";

/** 8-bit channels with a 0–1 alpha, matching CSS and `Color`. */
export interface Rgba {
	readonly r: number;
	readonly g: number;
	readonly b: number;
	readonly a: number;
}

export interface ColorLiteral {
	readonly kind: ColorKind;
	/** The namespace the call was written through — `Color`, or an alias. */
	readonly namespace: string;
	/** Offset of the first character of the namespace. */
	readonly start: number;
	/** Offset one past the closing parenthesis. */
	readonly end: number;
	readonly rgba: Rgba;
}

const KINDS: ReadonlyArray<ColorKind> = [
	"hex",
	"rgba",
	"hsl",
	"lab",
	"oklch",
	"tw",
];

const IDENT_CHAR = /[A-Za-z0-9_$]/;

/**
 * The identifiers `Color` is reachable through in this file.
 *
 * @remarks
 * Both import forms count: `import * as Color from "effect-motion/Color"`
 * (any alias) and `import { Color } from "effect-motion"` (with or without
 * `as`). A file that imports neither gets an empty set, which is how every
 * provider cheaply opts out of unrelated TypeScript.
 */
export const namespaces = (source: string): ReadonlySet<string> =>
	Imports.aliases(source, "Color");

interface Args {
	readonly args: ReadonlyArray<string>;
	/** Offset one past the closing parenthesis. */
	readonly end: number;
}

/**
 * Split the argument list that starts at `open` (the `(`), respecting
 * nesting and string literals. Returns `undefined` for an unterminated
 * call — a half-typed line, which must not produce a decoration.
 */
const readArgs = (source: string, open: number): Args | undefined => {
	const args: string[] = [];
	let depth = 0;
	let current = "";
	let quote: string | undefined;
	for (let i = open; i < source.length; i++) {
		const char = source[i] ?? "";
		if (quote !== undefined) {
			current += char;
			if (char === "\\") {
				current += source[i + 1] ?? "";
				i++;
			} else if (char === quote) quote = undefined;
			continue;
		}
		if (char === '"' || char === "'" || char === "`") {
			quote = char;
			current += char;
			continue;
		}
		if (char === "(" || char === "[" || char === "{") {
			depth++;
			if (depth === 1 && char === "(") continue;
			current += char;
			continue;
		}
		if (char === ")" || char === "]" || char === "}") {
			depth--;
			if (depth === 0 && char === ")") {
				if (current.trim() !== "" || args.length > 0) args.push(current);
				const trimmed = args.map((arg) => arg.trim());
				// a trailing comma leaves an empty final slot; it is not an argument
				if (trimmed.length > 1 && trimmed.at(-1) === "") trimmed.pop();
				return { args: trimmed, end: i + 1 };
			}
			current += char;
			continue;
		}
		if (char === "," && depth === 1) {
			args.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	return undefined;
};

/** A plain string literal's contents, or `undefined` for anything else. */
const stringArg = (arg: string | undefined): string | undefined => {
	if (arg === undefined) return undefined;
	const match = /^(["'])((?:[^\\]|\\.)*?)\1$/.exec(arg);
	return match?.[2];
};

/** A plain numeric literal's value, or `undefined` for anything else. */
const numberArg = (arg: string | undefined): number | undefined => {
	if (arg === undefined) return undefined;
	if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(arg.trim()))
		return undefined;
	const value = Number(arg);
	return Number.isFinite(value) ? value : undefined;
};

const clamp255 = (value: number) =>
	Math.max(0, Math.min(255, Math.round(value)));
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const fromChroma = (color: chroma.Color, alpha: number): Rgba => {
	const [r, g, b] = color.rgb();
	return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: clamp01(alpha) };
};

/** Evaluate one constructor's literal arguments, or give up. */
const evaluate = (
	kind: ColorKind,
	args: ReadonlyArray<string>,
): Rgba | undefined => {
	try {
		switch (kind) {
			case "hex": {
				const value = stringArg(args[0]);
				if (value === undefined || args.length !== 1) return undefined;
				if (!chroma.valid(value)) return undefined;
				const color = chroma(value);
				return fromChroma(color, color.alpha());
			}
			case "rgba": {
				const r = numberArg(args[0]);
				const g = numberArg(args[1]);
				const b = numberArg(args[2]);
				if (r === undefined || g === undefined || b === undefined)
					return undefined;
				const alpha = args.length > 3 ? numberArg(args[3]) : 1;
				if (alpha === undefined) return undefined;
				return {
					r: clamp255(r),
					g: clamp255(g),
					b: clamp255(b),
					a: clamp01(alpha),
				};
			}
			case "hsl":
			case "lab":
			case "oklch": {
				const a = numberArg(args[0]);
				const b = numberArg(args[1]);
				const c = numberArg(args[2]);
				if (a === undefined || b === undefined || c === undefined)
					return undefined;
				const alpha = args.length > 3 ? numberArg(args[3]) : 1;
				if (alpha === undefined) return undefined;
				return fromChroma(chroma[kind](a, b, c), alpha);
			}
			case "tw": {
				const name = stringArg(args[0]);
				if (name === undefined || !(name in twPalette)) return undefined;
				const shades = twPalette[name as keyof typeof twPalette];
				const shade = args.length > 1 ? stringArg(args[1]) : "400";
				if (shade === undefined || !(shade in shades)) return undefined;
				const [r, g, b] = shades[shade as keyof typeof shades];
				const alpha = args.length > 2 ? numberArg(args[2]) : 1;
				if (alpha === undefined) return undefined;
				return { r, g, b, a: clamp01(alpha) };
			}
		}
	} catch {
		// chroma throws on inputs it cannot make sense of; a call it rejects
		// simply gets no swatch
		return undefined;
	}
};

/**
 * Every colour constructor in `source` whose arguments are literals.
 *
 * @remarks
 * Results are ordered by position and never overlap.
 */
export const scan = (source: string): ReadonlyArray<ColorLiteral> => {
	const found: ColorLiteral[] = [];
	for (const namespace of namespaces(source)) {
		for (const kind of KINDS) {
			const needle = `${namespace}.${kind}`;
			let from = 0;
			for (;;) {
				const at = source.indexOf(needle, from);
				if (at === -1) break;
				from = at + needle.length;

				// the namespace must stand alone: `MyColor.tw(` is somebody
				// else's API that merely ends in our identifier
				const before = at === 0 ? "" : (source[at - 1] ?? "");
				if (before !== "" && IDENT_CHAR.test(before)) continue;

				// the constructor name must end here: `Color.hexish(` is not `hex`
				let cursor = from;
				while (cursor < source.length && /\s/.test(source[cursor] ?? ""))
					cursor++;
				if (source[cursor] !== "(") continue;

				const parsed = readArgs(source, cursor);
				if (parsed === undefined) continue;
				const rgba = evaluate(kind, parsed.args);
				if (rgba === undefined) continue;
				found.push({ kind, namespace, start: at, end: parsed.end, rgba });
			}
		}
	}
	return found.sort((a, b) => a.start - b.start);
};

const trim = (value: number, digits: number) => {
	const rounded = Number(value.toFixed(digits));
	return Object.is(rounded, -0) ? 0 : rounded;
};

const hexString = ({ r, g, b, a }: Rgba): string => {
	const pair = (value: number) => value.toString(16).padStart(2, "0");
	const base = `#${pair(r)}${pair(g)}${pair(b)}`;
	return a >= 1 ? base : `${base}${pair(clamp255(a * 255))}`;
};

/**
 * The source text that replaces `literal` with `rgba`.
 *
 * @remarks
 * The constructor is preserved wherever it can express the new colour, so
 * a picker nudged one shade darker leaves an `oklch` call an `oklch` call.
 * `tw` is the exception: the palette is a fixed set of names, so an
 * arbitrary colour has to fall back to `hex` — that rewrite is visible in
 * the diff, which is the honest outcome.
 */
export const format = (literal: ColorLiteral, rgba: Rgba): string => {
	const ns = literal.namespace;
	const color = chroma.rgb(rgba.r, rgba.g, rgba.b);
	const alphaArg = rgba.a >= 1 ? "" : `, ${trim(rgba.a, 3)}`;
	switch (literal.kind) {
		case "rgba":
			return `${ns}.rgba(${rgba.r}, ${rgba.g}, ${rgba.b}${alphaArg})`;
		case "hsl": {
			const [h, s, l] = color.hsl();
			// chroma reports NaN hue for greys; 0 is the conventional stand-in
			const hue = Number.isNaN(h) ? 0 : h;
			return `${ns}.hsl(${trim(hue, 2)}, ${trim(s, 3)}, ${trim(l, 3)}${alphaArg})`;
		}
		case "lab": {
			const [l, a, b] = color.lab();
			return `${ns}.lab(${trim(l, 2)}, ${trim(a, 2)}, ${trim(b, 2)}${alphaArg})`;
		}
		case "oklch": {
			const [l, c, h] = color.oklch();
			const hue = Number.isNaN(h) ? 0 : h;
			return `${ns}.oklch(${trim(l, 3)}, ${trim(c, 3)}, ${trim(hue, 3)}${alphaArg})`;
		}
		case "hex":
		case "tw":
			return `${ns}.hex("${hexString(rgba)}")`;
	}
};
