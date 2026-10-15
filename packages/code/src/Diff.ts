/**
 * The deterministic edit planner behind `Code.editTo`.
 *
 * Plans a transition between two highlighted sources as pure data:
 * line-level LCS anchors whole lines, token-level LCS inside changed line
 * groups classifies kept/removed/inserted tokens, and a final migration
 * pass pairs identical removed/inserted token RUNS across lines so an
 * extracted expression slides instead of fading. Pure functions of the two
 * highlights — same inputs, same plan, always.
 */
import * as Color from "effect-motion/Color";
import type * as Entity from "effect-motion/Entity";
import type * as Highlight from "./Highlight.js";

/** A character cell on the block's monospace grid. */
export interface GridPos {
	readonly line: number;
	readonly col: number;
}

/** One animated unit of an edit transition. */
export type Fragment =
	| {
			readonly kind: "kept";
			readonly text: string;
			readonly from: GridPos;
			readonly to: GridPos;
			readonly fromColor: Color.Color;
			readonly toColor: Color.Color;
	  }
	| {
			readonly kind: "removed";
			readonly text: string;
			readonly from: GridPos;
			readonly color: Color.Color;
	  }
	| {
			readonly kind: "inserted";
			readonly text: string;
			readonly to: GridPos;
			readonly color: Color.Color;
	  };

export interface EditPlan {
	/** old line → new line for lines kept whole (same text, same colors) */
	readonly wholeLines: ReadonlyArray<{
		readonly from: number;
		readonly to: number;
	}>;
	/** token fragments for every line that is not kept whole */
	readonly fragments: ReadonlyArray<Fragment>;
	/** old line indices whose Text splits into fragments, ascending */
	readonly splitLines: ReadonlyArray<number>;
}

interface Token {
	readonly line: number;
	readonly col: number;
	readonly text: string;
	readonly color: Color.Color;
	/** position in the line's token sequence — adjacency for run grouping */
	readonly indexInLine: number;
}

const keyOf = (color: Color.Color): string => {
	const { r, g, b, a } = Color.bytes(color);
	return `${r},${g},${b},${a}`;
};

/** the color painting UTF-16 offset `at`, from sorted non-overlapping spans */
const colorAt = (
	spans: ReadonlyArray<Entity.Span>,
	at: number,
	ink: Color.Color,
): Color.Color => {
	for (const span of spans) {
		if (span.from <= at && at < span.to) {
			return span.fillColor;
		}
		if (span.from > at) {
			break;
		}
	}
	return ink;
};

const isSpace = (character: string): boolean =>
	character === " " || character === "\t";

const isWord = (character: string): boolean => /[A-Za-z0-9_$]/.test(character);

/**
 * Non-whitespace tokens per line, split at color changes AND at
 * word/non-word boundaries, so `bar(x` is `bar` `(` `x` — the granularity
 * a slide animation needs. Same-color punctuation runs stay together
 * (`();`, `=>`), which keeps ligatures intact inside a fragment.
 */
const tokenizeLines = (
	highlighted: Highlight.Highlighted,
	ink: Color.Color,
): Array<Array<Token>> => {
	const lines = highlighted.text.split("\n");
	const result: Array<Array<Token>> = [];
	let offset = 0;
	for (const [lineIndex, line] of lines.entries()) {
		const tokens: Array<Token> = [];
		let col = 0;
		while (col < line.length) {
			const character = line[col] ?? "";
			if (isSpace(character)) {
				col++;
				continue;
			}
			const color = colorAt(highlighted.spans, offset + col, ink);
			const key = keyOf(color);
			const wordness = isWord(character);
			let end = col + 1;
			while (end < line.length) {
				const next = line[end] ?? "";
				if (
					isSpace(next) ||
					isWord(next) !== wordness ||
					keyOf(colorAt(highlighted.spans, offset + end, ink)) !== key
				) {
					break;
				}
				end++;
			}
			tokens.push({
				line: lineIndex,
				col,
				text: line.slice(col, end),
				color,
				indexInLine: tokens.length,
			});
			col = end;
		}
		result.push(tokens);
		offset += line.length + 1; // +1 for the newline
	}
	return result;
};

/**
 * Classic LCS with a fixed backtrack order (diagonal first, then skip-a),
 * so matching is deterministic for equal-length alternatives.
 */
const lcsPairs = <A>(
	a: ReadonlyArray<A>,
	b: ReadonlyArray<A>,
	eq: (x: A, y: A) => boolean,
): Array<readonly [number, number]> => {
	const n = a.length;
	const m = b.length;
	const dp: Array<Array<number>> = Array.from({ length: n + 1 }, () =>
		new Array<number>(m + 1).fill(0),
	);
	for (let i = 1; i <= n; i++) {
		const row = dp[i] ?? [];
		const prev = dp[i - 1] ?? [];
		for (let j = 1; j <= m; j++) {
			const ai = a[i - 1];
			const bj = b[j - 1];
			row[j] =
				ai !== undefined && bj !== undefined && eq(ai, bj)
					? (prev[j - 1] ?? 0) + 1
					: Math.max(prev[j] ?? 0, row[j - 1] ?? 0);
		}
	}
	const pairs: Array<readonly [number, number]> = [];
	let i = n;
	let j = m;
	while (i > 0 && j > 0) {
		const ai = a[i - 1];
		const bj = b[j - 1];
		if (
			ai !== undefined &&
			bj !== undefined &&
			eq(ai, bj) &&
			(dp[i]?.[j] ?? 0) === (dp[i - 1]?.[j - 1] ?? 0) + 1
		) {
			pairs.push([i - 1, j - 1] as const);
			i--;
			j--;
		} else if ((dp[i - 1]?.[j] ?? 0) >= (dp[i]?.[j - 1] ?? 0)) {
			i--;
		} else {
			j--;
		}
	}
	pairs.reverse();
	return pairs;
};

const sameTokenColors = (
	a: ReadonlyArray<Token>,
	b: ReadonlyArray<Token>,
): boolean =>
	a.length === b.length &&
	a.every((token, index) => {
		const other = b[index];
		return other !== undefined && keyOf(token.color) === keyOf(other.color);
	});

/** maximal runs of tokens adjacent in their line's token sequence */
const runsOf = (tokens: ReadonlyArray<Token>): Array<Array<Token>> => {
	const runs: Array<Array<Token>> = [];
	for (const token of tokens) {
		const current = runs.at(-1);
		const last = current?.at(-1);
		if (
			current !== undefined &&
			last !== undefined &&
			last.line === token.line &&
			last.indexInLine + 1 === token.indexInLine
		) {
			current.push(token);
		} else {
			runs.push([token]);
		}
	}
	return runs;
};

/** the run's exact source text, inter-token spacing included */
const runSlice = (lines: ReadonlyArray<string>, run: ReadonlyArray<Token>) => {
	const first = run[0];
	const last = run.at(-1);
	if (first === undefined || last === undefined) {
		return "";
	}
	return (lines[first.line] ?? "").slice(
		first.col,
		last.col + last.text.length,
	);
};

/**
 * Plan the transition from `before` to `after`.
 *
 * @remarks
 * Deterministic and total: every old token ends up kept or removed, every
 * new token kept or inserted, every old line either kept whole or split.
 * `ink` is the color of unspanned tokens (the block's base fill).
 */
export const plan = (
	before: Highlight.Highlighted,
	after: Highlight.Highlighted,
	ink: Color.Color,
): EditPlan => {
	const oldLines = before.text.split("\n");
	const newLines = after.text.split("\n");
	const oldTokens = tokenizeLines(before, ink);
	const newTokens = tokenizeLines(after, ink);

	const anchors = lcsPairs(oldLines, newLines, (x, y) => x === y);

	const wholeLines: Array<{ from: number; to: number }> = [];
	const groups: Array<{
		readonly old: ReadonlyArray<Token>;
		readonly new: ReadonlyArray<Token>;
	}> = [];

	const pushGap = (
		oldStart: number,
		oldEnd: number,
		newStart: number,
		newEnd: number,
	): void => {
		if (oldStart >= oldEnd && newStart >= newEnd) {
			return;
		}
		groups.push({
			old: oldTokens.slice(oldStart, oldEnd).flat(),
			new: newTokens.slice(newStart, newEnd).flat(),
		});
	};

	let oldCursor = 0;
	let newCursor = 0;
	for (const [i, j] of anchors) {
		pushGap(oldCursor, i, newCursor, j);
		if (sameTokenColors(oldTokens[i] ?? [], newTokens[j] ?? [])) {
			wholeLines.push({ from: i, to: j });
		} else {
			// same text, different colors: a recolor group of its own — every
			// token matches, so it becomes kept fragments with color tweens
			groups.push({
				old: oldTokens[i] ?? [],
				new: newTokens[j] ?? [],
			});
		}
		oldCursor = i + 1;
		newCursor = j + 1;
	}
	pushGap(oldCursor, oldLines.length, newCursor, newLines.length);

	const fragments: Array<Fragment> = [];
	const removedLeft: Array<Token> = [];
	const insertedLeft: Array<Token> = [];

	for (const group of groups) {
		const matched = lcsPairs(group.old, group.new, (x, y) => x.text === y.text);
		const oldMatched = new Set(matched.map(([i]) => i));
		const newMatched = new Set(matched.map(([, j]) => j));
		for (const [i, j] of matched) {
			const source = group.old[i];
			const target = group.new[j];
			if (source === undefined || target === undefined) {
				continue;
			}
			fragments.push({
				kind: "kept",
				text: source.text,
				from: { line: source.line, col: source.col },
				to: { line: target.line, col: target.col },
				fromColor: source.color,
				toColor: target.color,
			});
		}
		for (const [i, token] of group.old.entries()) {
			if (!oldMatched.has(i)) {
				removedLeft.push(token);
			}
		}
		for (const [j, token] of group.new.entries()) {
			if (!newMatched.has(j)) {
				insertedLeft.push(token);
			}
		}
	}

	// migration: pair identical removed/inserted runs across lines,
	// first match in source order, so extracted expressions slide
	const removedRuns = runsOf(removedLeft);
	const insertedRuns = runsOf(insertedLeft);
	const migrated = new Set<Token>();
	const claimed = new Set<number>();
	for (const run of removedRuns) {
		const slice = runSlice(oldLines, run);
		const matchIndex = insertedRuns.findIndex(
			(candidate, index) =>
				!claimed.has(index) &&
				candidate.length === run.length &&
				runSlice(newLines, candidate) === slice &&
				sameTokenColors(run, candidate),
		);
		if (matchIndex === -1) {
			continue;
		}
		claimed.add(matchIndex);
		const target = insertedRuns[matchIndex] ?? [];
		for (const [index, token] of run.entries()) {
			const landing = target[index];
			if (landing === undefined) {
				continue;
			}
			migrated.add(token);
			migrated.add(landing);
			fragments.push({
				kind: "kept",
				text: token.text,
				from: { line: token.line, col: token.col },
				to: { line: landing.line, col: landing.col },
				fromColor: token.color,
				toColor: landing.color,
			});
		}
	}
	// token-level fallback for leftovers a run couldn't pair (the run shapes
	// differed): identical tokens of 2+ characters still migrate one-to-one.
	// Single characters are excluded — a lone paren flying across the block
	// reads as noise, not motion.
	for (const token of removedLeft) {
		if (migrated.has(token) || token.text.length < 2) {
			continue;
		}
		const landing = insertedLeft.find(
			(candidate) =>
				!migrated.has(candidate) &&
				candidate.text === token.text &&
				keyOf(candidate.color) === keyOf(token.color),
		);
		if (landing === undefined) {
			continue;
		}
		migrated.add(token);
		migrated.add(landing);
		fragments.push({
			kind: "kept",
			text: token.text,
			from: { line: token.line, col: token.col },
			to: { line: landing.line, col: landing.col },
			fromColor: token.color,
			toColor: landing.color,
		});
	}
	for (const token of removedLeft) {
		if (!migrated.has(token)) {
			fragments.push({
				kind: "removed",
				text: token.text,
				from: { line: token.line, col: token.col },
				color: token.color,
			});
		}
	}
	for (const token of insertedLeft) {
		if (!migrated.has(token)) {
			fragments.push({
				kind: "inserted",
				text: token.text,
				to: { line: token.line, col: token.col },
				color: token.color,
			});
		}
	}

	const whole = new Set(wholeLines.map((entry) => entry.from));
	const splitLines: Array<number> = [];
	for (let line = 0; line < oldLines.length; line++) {
		if (!whole.has(line)) {
			splitLines.push(line);
		}
	}

	return { wholeLines, fragments, splitLines };
};
