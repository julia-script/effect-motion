import type { TextContent, TextInline, TextParagraph } from "./shapes/Text";

/**
 * Rich text as a flat stream, for diffing and progressive editing.
 *
 * A rich-text tree (`Shapes.TextContent`) can split one visible sentence
 * across several inline nodes (`he` + **`llo`**), and edits cross those
 * boundaries. Working on the tree directly is awkward, so this module
 * linearises it into {@link Unit}s — one cluster each, tagged with the
 * marks in force — diffs and edits the stream, then {@link rebuild}s a
 * canonical tree. Pure and self-contained; useful beyond the typewriter
 * (markdown authoring, text morphs, future per-run styling).
 */

/** The inline marks in force on a cluster. */
export interface Marks {
	readonly strong: boolean;
	readonly emphasis: boolean;
}

const NO_MARKS: Marks = { strong: false, emphasis: false };

export const marksEqual = (a: Marks, b: Marks): boolean =>
	a.strong === b.strong && a.emphasis === b.emphasis;

/**
 * The atom of diffing and typing: a single cluster with its marks, or a
 * paragraph boundary (which behaves like pressing Enter).
 */
export type Unit =
	| {
			readonly kind: "grapheme";
			readonly cluster: string;
			readonly marks: Marks;
	  }
	| { readonly kind: "break" };

/** Grapheme clusters (default) or whole words. */
export type Granularity = "grapheme" | "word";

// Fixed locale so segmentation is deterministic across platforms. Grapheme
// segmentation is locale-independent; word segmentation is not, so it is
// pinned. Constructed once — Intl.Segmenter is stateless per call.
const segmenters: Record<Granularity, Intl.Segmenter> = {
	grapheme: new Intl.Segmenter("en", { granularity: "grapheme" }),
	word: new Intl.Segmenter("en", { granularity: "word" }),
};

/** Split a string into clusters at the given granularity. */
export const segment = (
	text: string,
	granularity: Granularity = "grapheme",
): ReadonlyArray<string> =>
	Array.from(segmenters[granularity].segment(text), (s) => s.segment);

const flattenInline = (
	node: TextInline,
	marks: Marks,
	granularity: Granularity,
	out: Array<Unit>,
): void => {
	switch (node.type) {
		case "text":
			for (const cluster of segment(node.value, granularity)) {
				out.push({ kind: "grapheme", cluster, marks });
			}
			return;
		case "strong":
			for (const child of node.children) {
				flattenInline(child, { ...marks, strong: true }, granularity, out);
			}
			return;
		case "emphasis":
			for (const child of node.children) {
				flattenInline(child, { ...marks, emphasis: true }, granularity, out);
			}
			return;
	}
};

/**
 * Flatten a `TextContent` into a unit stream: each inline text node is
 * segmented (per node, so a unit never straddles a mark boundary) and its
 * clusters tagged with the marks accumulated from `strong`/`emphasis`
 * ancestors; paragraph boundaries become a single `break` unit.
 */
export const flatten = (
	content: TextContent,
	granularity: Granularity = "grapheme",
): ReadonlyArray<Unit> => {
	const out: Array<Unit> = [];
	if (typeof content === "string") {
		for (const cluster of segment(content, granularity)) {
			out.push({ kind: "grapheme", cluster, marks: NO_MARKS });
		}
		return out;
	}
	content.children.forEach((paragraph, index) => {
		if (index > 0) {
			out.push({ kind: "break" });
		}
		for (const child of paragraph.children) {
			flattenInline(child, NO_MARKS, granularity, out);
		}
	});
	return out;
};

// strong outside emphasis — the canonical nesting rebuild always emits
const wrap = (value: string, marks: Marks): TextInline => {
	let node: TextInline = { type: "text", value };
	if (marks.emphasis) {
		node = { type: "emphasis", children: [node] };
	}
	if (marks.strong) {
		node = { type: "strong", children: [node] };
	}
	return node;
};

const buildParagraph = (
	units: ReadonlyArray<Extract<Unit, { kind: "grapheme" }>>,
): TextParagraph => {
	const children: Array<TextInline> = [];
	let i = 0;
	while (i < units.length) {
		// biome-ignore lint/style/noNonNullAssertion: i < length
		const head = units[i]!;
		let j = i + 1;
		while (j < units.length && marksEqual(units[j]!.marks, head.marks)) {
			j++;
		}
		const value = units
			.slice(i, j)
			.map((u) => u.cluster)
			.join("");
		children.push(wrap(value, head.marks));
		i = j;
	}
	return { type: "paragraph", children };
};

/**
 * Rebuild a canonical `TextContent` from a unit stream: `break`s split
 * paragraphs, equal-mark runs coalesce into nodes (`strong` nesting
 * outside `emphasis`). A single unmarked paragraph rebuilds to a plain
 * string (matching how such text is authored); no units rebuild to `""`.
 * `rebuild(flatten(x))` is therefore a canonicalisation, idempotent under
 * re-flatten.
 */
export const rebuild = (units: ReadonlyArray<Unit>): TextContent => {
	const paragraphs: Array<Array<Extract<Unit, { kind: "grapheme" }>>> = [[]];
	for (const unit of units) {
		if (unit.kind === "break") {
			paragraphs.push([]);
		} else {
			// biome-ignore lint/style/noNonNullAssertion: seeded with one array
			paragraphs[paragraphs.length - 1]!.push(unit);
		}
	}
	// plain-string fast path: one paragraph, nothing marked
	if (paragraphs.length === 1) {
		// biome-ignore lint/style/noNonNullAssertion: length checked
		const only = paragraphs[0]!;
		if (only.every((u) => !u.marks.strong && !u.marks.emphasis)) {
			return only.map((u) => u.cluster).join("");
		}
	}
	return { type: "root", children: paragraphs.map(buildParagraph) };
};

/** One aligned step of an edit script over units. */
export type Op =
	| { readonly op: "keep"; readonly unit: Unit }
	| { readonly op: "delete"; readonly unit: Unit }
	| { readonly op: "insert"; readonly unit: Unit };

export const unitsEqual = (a: Unit, b: Unit): boolean => {
	if (a.kind !== b.kind) {
		return false;
	}
	if (a.kind !== "grapheme" || b.kind !== "grapheme") {
		return true; // both breaks
	}
	return a.cluster === b.cluster && marksEqual(a.marks, b.marks);
};

/**
 * Diff two unit streams into keep/delete/insert ops. The kept units form a
 * longest common subsequence; applying the deletes then the inserts turns
 * `from` into `to`. Two units are equal only if same kind, cluster, and
 * marks — so a formatting change is a delete+insert (a retype), which is
 * what actually happens when you can't reformat by typing.
 *
 * ponytail: O(n·m) LCS table. Animated text is short (captions, titles),
 * so the quadratic cost is fine; swap in Myers O(n·d) if long documents
 * ever need diffing.
 */
export const diff = (
	from: ReadonlyArray<Unit>,
	to: ReadonlyArray<Unit>,
): ReadonlyArray<Op> => {
	const n = from.length;
	const m = to.length;
	// lcs[i][j] = LCS length of from[i..] and to[j..]
	const lcs: Array<Array<number>> = Array.from({ length: n + 1 }, () =>
		new Array<number>(m + 1).fill(0),
	);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			// biome-ignore lint/style/noNonNullAssertion: indices in range
			lcs[i]![j] = unitsEqual(from[i]!, to[j]!)
				? // biome-ignore lint/style/noNonNullAssertion: indices in range
					lcs[i + 1]![j + 1]! + 1
				: // biome-ignore lint/style/noNonNullAssertion: indices in range
					Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
		}
	}
	const ops: Array<Op> = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		// biome-ignore lint/style/noNonNullAssertion: indices in range
		if (unitsEqual(from[i]!, to[j]!)) {
			// biome-ignore lint/style/noNonNullAssertion: indices in range
			ops.push({ op: "keep", unit: to[j]! });
			i++;
			j++;
			// biome-ignore lint/style/noNonNullAssertion: indices in range
		} else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
			// biome-ignore lint/style/noNonNullAssertion: indices in range
			ops.push({ op: "delete", unit: from[i]! });
			i++;
		} else {
			// biome-ignore lint/style/noNonNullAssertion: indices in range
			ops.push({ op: "insert", unit: to[j]! });
			j++;
		}
	}
	while (i < n) {
		// biome-ignore lint/style/noNonNullAssertion: indices in range
		ops.push({ op: "delete", unit: from[i]! });
		i++;
	}
	while (j < m) {
		// biome-ignore lint/style/noNonNullAssertion: indices in range
		ops.push({ op: "insert", unit: to[j]! });
		j++;
	}
	return ops;
};
