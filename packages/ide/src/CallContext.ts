/**
 * Where in an effect-motion call is the cursor?
 *
 * @remarks
 * Completions and hovers both need the same small fact: this string
 * literal is the easing argument of a `Motion` animator, or the preset
 * argument of a `Physics` spring, or the tag of a `Scene.instantiate`.
 * TypeScript knows all of that from the types — but it cannot draw a curve
 * next to it, which is the whole point of the integration.
 *
 * The answer comes from one forward scan that tracks brackets, strings, and
 * comments. It is deliberately syntactic: no type information, no project
 * load, nothing to keep warm.
 *
 * Animators are duals — `Motion.moveTo(dot, to, duration, easing)` and
 * `dot.pipe(Motion.moveTo(to, duration, easing))` are the same call with
 * different arities — so the argument INDEX means nothing on its own. What
 * does hold across both forms is order: the easing follows the duration.
 * That is the rule used here.
 */

import * as Durations from "./Durations.js";

/** What the cursor's string literal is asking to be. */
export type Suggestion = "easing" | "spring" | "entity" | "duration";

export interface StringLiteral {
	/** Offset of the opening quote. */
	readonly start: number;
	/** Offset one past the closing quote. */
	readonly end: number;
	/** The contents, without quotes. */
	readonly text: string;
}

export interface CallContext {
	/** The dotted callee, e.g. `Motion.moveTo`. Empty for an anonymous call. */
	readonly callee: string;
	/** Top-level arguments before the cursor. */
	readonly argIndex: number;
	/** Of those, how many were duration-shaped string literals. */
	readonly precedingDurations: number;
	/** The string literal the cursor sits inside, if any. */
	readonly literal: StringLiteral | undefined;
}

interface Frame {
	readonly callee: string;
	commas: number;
	durations: number;
}

const IDENT = /[A-Za-z0-9_$.]/;

/** Read the dotted callee immediately before `open`. */
const calleeBefore = (source: string, open: number): string => {
	let end = open;
	while (end > 0 && /\s/.test(source[end - 1] ?? "")) end--;
	let start = end;
	while (start > 0 && IDENT.test(source[start - 1] ?? "")) start--;
	return source.slice(start, end);
};

/**
 * The innermost call the cursor sits in, with the literal it is inside.
 *
 * @remarks
 * Returns `undefined` when the offset is not inside a call at all.
 */
export const at = (source: string, offset: number): CallContext | undefined => {
	const stack: Frame[] = [];
	let literal: StringLiteral | undefined;
	let result: CallContext | undefined;

	const capture = () => {
		if (result !== undefined) return;
		const frame = stack.at(-1);
		if (frame === undefined) return;
		result = {
			callee: frame.callee,
			argIndex: frame.commas,
			precedingDurations: frame.durations,
			literal,
		};
	};

	// everything past the cursor is irrelevant: a literal or comment that
	// CONTAINS the offset necessarily opens before it
	for (let i = 0; i < source.length && i < offset; i++) {
		const char = source[i] ?? "";
		const next = source[i + 1] ?? "";

		if (char === "/" && next === "/") {
			const end = source.indexOf("\n", i);
			if (i < offset && offset <= (end === -1 ? source.length : end)) return;
			i = end === -1 ? source.length : end;
			continue;
		}
		if (char === "/" && next === "*") {
			const end = source.indexOf("*/", i + 2);
			const stop = end === -1 ? source.length : end + 2;
			if (i < offset && offset < stop) return;
			i = stop - 1;
			continue;
		}

		if (char === '"' || char === "'" || char === "`") {
			let j = i + 1;
			for (; j < source.length; j++) {
				const inner = source[j] ?? "";
				if (inner === "\\") {
					j++;
					continue;
				}
				if (inner === char) break;
				// an unterminated literal must not swallow the rest of the file
				if (char !== "`" && inner === "\n") break;
			}
			const closed = source[j] === char;
			const end = closed ? j + 1 : j;
			const text = source.slice(i + 1, j);
			if (offset > i && offset < end) {
				literal = { start: i, end, text };
				capture();
			} else if (end <= offset) {
				const frame = stack.at(-1);
				if (frame !== undefined && Durations.isDuration(text))
					frame.durations++;
			}
			i = end - 1;
			continue;
		}

		if (char === "(" || char === "[" || char === "{") {
			stack.push({
				callee: char === "(" ? calleeBefore(source, i) : "",
				commas: 0,
				durations: 0,
			});
			continue;
		}
		if (char === ")" || char === "]" || char === "}") {
			stack.pop();
			continue;
		}
		if (char === ",") {
			const frame = stack.at(-1);
			if (frame !== undefined) frame.commas++;
		}
	}

	if (result !== undefined) return result;
	const frame = stack.at(-1);
	if (frame === undefined) return undefined;
	return {
		callee: frame.callee,
		argIndex: frame.commas,
		precedingDurations: frame.durations,
		literal: undefined,
	};
};

const MOTION_ANIMATORS = new Set([
	"tween",
	"tweenTo",
	"move",
	"moveTo",
	"fade",
	"fadeTo",
]);

const DURATION_ONLY = new Set(["wait", "sleep"]);

const SPRING_ANIMATORS = new Set(["spring", "springTo"]);

/** The last segment of a dotted callee — `moveTo` for `Motion.moveTo`. */
const member = (callee: string): string => callee.split(".").at(-1) ?? "";

/** The namespace segment — `Motion` for `Motion.moveTo`, empty when bare. */
const namespace = (callee: string): string => {
	const parts = callee.split(".");
	return parts.length > 1 ? (parts.at(-2) ?? "") : "";
};

/**
 * What the string literal under the cursor should be completed with.
 *
 * @remarks
 * The namespace is checked where it disambiguates (`Physics.spring` is not
 * `Scene.spring`) but not required, so a deep import aliased to something
 * else still gets suggestions from the member name alone.
 */
export const suggestionAt = (
	source: string,
	offset: number,
): Suggestion | undefined => {
	const context = at(source, offset);
	if (context === undefined || context.literal === undefined) return undefined;
	const name = member(context.callee);
	const ns = namespace(context.callee);

	if (name === "instantiate")
		return context.argIndex === 0 ? "entity" : undefined;
	if (DURATION_ONLY.has(name)) return "duration";
	if (SPRING_ANIMATORS.has(name)) return "spring";
	if (MOTION_ANIMATORS.has(name)) {
		// `Scene.all` / `Scene.chain` take effects, never these strings
		if (ns === "Scene") return undefined;
		return context.precedingDurations > 0 ? "easing" : "duration";
	}
	return undefined;
};
