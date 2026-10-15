/**
 * Code blocks: highlighted source on a monospace grid that evolves.
 *
 * A block is ordinary instances — a `Group` holding one `Text` per source
 * line — positioned by grid arithmetic alone: line `l`, column `c` sits at
 * `(c · charWidth · fontSize, −l · lineHeight · fontSize)`. Lines NEVER
 * wrap; that invariant is what makes every position computable without
 * measuring text. Because the block is a plain Group, every standard
 * animator already works on it.
 *
 * `editTo` transitions to a new source: a deterministic diff (see
 * `Diff.ts`) decides what slides, fades out, or fades in. Between edits the
 * block is exactly one Text per line; fragment Texts exist only while a
 * transition runs.
 *
 * @example
 * ```typescript
 * import { parser } from "@lezer/javascript";
 * import * as Code from "@effect-motion/code/Code";
 * import * as Highlight from "@effect-motion/code/Highlight";
 *
 * const scene = Scene.make(function* () {
 * 	const block = yield* Code.block({
 * 		code: 'const x = 1;',
 * 		parser,
 * 		theme: Highlight.defaultTheme,
 * 		fontSize: 32,
 * 		grid: { charWidth: 0.6, lineHeight: 1.4 },
 * 	});
 * 	yield* Code.editTo(block, 'const x = 1;\nconst y = x + 1;', {
 * 		duration: "800 millis",
 * 	});
 * });
 * ```
 */
import type { Parser } from "@lezer/common";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as Predicate from "effect/Predicate";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import type * as Instance from "effect-motion/Instance";
import * as Motion from "effect-motion/Motion";
import * as Runner from "effect-motion/Runner";
import * as Scene from "effect-motion/Scene";
import type * as Timing from "effect-motion/Timing";
import * as Diff from "./Diff.js";
import * as Highlight from "./Highlight.js";
import * as Selection from "./Selection.js";

/**
 * The monospace grid, as em ratios of `fontSize`: `charWidth` is one
 * column's advance, `lineHeight` one line's leading. Derive exact values
 * from font bytes with `Metrics.gridFromFont`, or declare them (JetBrains
 * Mono is 0.6 / 1.4-ish).
 */
export interface Grid {
	readonly charWidth: number;
	readonly lineHeight: number;
}

const TypeId = "~effect-motion-code/CodeBlock" as const;

interface BlockState {
	code: string;
	highlighted: Highlight.Highlighted;
	/** one Text per source line — the rest-state invariant */
	lines: Array<Instance.Instance<"Text">>;
	/** loud-defect latch: overlapping edits on one block are unsupported */
	editing: boolean;
	readonly grid: Grid;
	readonly fontSize: number;
	readonly theme: Highlight.Theme;
	readonly parser: Parser;
	readonly fontFamily: Entity.MakeInput<"Text">["fontFamily"] | undefined;
	readonly ink: Color.Color;
}

/**
 * A live code block: the `Group` instance everything hangs from, plus the
 * authoring state `editTo`/`selectTo` read and advance. Animate `group`
 * with any standard animator to move or fade the whole block.
 */
export interface CodeBlock {
	readonly [TypeId]: typeof TypeId;
	readonly group: Instance.Instance<"Group">;
	/** internal: authoring bookkeeping — not part of the public surface */
	readonly "~code.state": BlockState;
}

export const isCodeBlock = (u: unknown): u is CodeBlock =>
	Predicate.hasProperty(u, TypeId);

export interface BlockOptions {
	/** The source to display. Tabs are rejected — the grid counts columns. */
	readonly code: string;
	/** A Lezer parser — your own language dependency. */
	readonly parser: Parser;
	readonly theme: Highlight.Theme;
	readonly fontSize: number;
	readonly grid: Grid;
	/** A Font resource reference; the built-in default face when omitted. */
	readonly fontFamily?: Entity.MakeInput<"Text">["fontFamily"] | undefined;
	/**
	 * The ink for unthemed tokens — the base `fillColor` of every line.
	 *
	 * @defaultValue white
	 */
	readonly fillColor?: Color.Color | undefined;
	/** The block origin (its top-left corner), in parent coordinates. */
	readonly position?: Entity.Vec3 | undefined;
}

// ── grid arithmetic ──────────────────────────────────────────────────────
// y-up scene space: lines grow DOWNWARD, so line l sits at negative y.

const gridX = (state: BlockState, col: number): number =>
	col * state.grid.charWidth * state.fontSize;

const gridY = (state: BlockState, line: number): number =>
	-line * state.grid.lineHeight * state.fontSize;

const gridPosition = (state: BlockState, pos: Diff.GridPos): Entity.Vec3 =>
	Entity.vec3({ x: gridX(state, pos.col), y: gridY(state, pos.line) });

// ── span slicing ─────────────────────────────────────────────────────────

interface LineSlice {
	readonly text: string;
	readonly spans: ReadonlyArray<Entity.Span>;
}

/** per-line text + spans, clipped at line boundaries and re-based to 0 */
const sliceLines = (highlighted: Highlight.Highlighted): Array<LineSlice> => {
	const lines = highlighted.text.split("\n");
	const slices: Array<LineSlice> = [];
	let offset = 0;
	for (const line of lines) {
		const end = offset + line.length;
		const spans: Array<Entity.Span> = [];
		for (const span of highlighted.spans) {
			const from = Math.max(span.from, offset);
			const to = Math.min(span.to, end);
			if (from < to) {
				spans.push(
					Entity.Span.make({
						from: from - offset,
						to: to - offset,
						fillColor: span.fillColor,
					}),
				);
			}
		}
		slices.push({ text: line, spans });
		offset = end + 1;
	}
	return slices;
};

const lineProps = (
	state: BlockState,
	line: number,
	slice: LineSlice,
): Runner.InstantiateProps<"Text"> => ({
	text: slice.text,
	position: Entity.vec3({ x: 0, y: gridY(state, line) }),
	fontSize: state.fontSize,
	fillColor: state.ink,
	baseline: "hanging",
	...(state.fontFamily !== undefined ? { fontFamily: state.fontFamily } : {}),
	...(slice.spans.length > 0 ? { spans: slice.spans } : {}),
});

const rejectTabs = (code: string, where: string) =>
	code.includes("\t")
		? Effect.die(
				new Error(
					`${where}: source contains tab characters — expand tabs to spaces, the grid counts columns`,
				),
			)
		: Effect.void;

/**
 * Instantiate a code block: a Group with one Text per source line, each
 * carrying its slice of the highlight spans, on the monospace grid.
 *
 * @remarks
 * The handle's state advances as `editTo` calls run, so an `editTo`
 * replayed by `Scene.repeat` diffs against the code the block ALREADY
 * shows and becomes a no-op on the second pass — rebuild the block per
 * iteration to loop an edit.
 */
export const block = Effect.fnUntraced(function* (
	options: BlockOptions,
): Effect.fn.Return<CodeBlock, never, Runner.Runner> {
	yield* rejectTabs(options.code, "Code.block");
	const highlighted = Highlight.highlight(
		options.code,
		options.parser,
		options.theme,
	);
	const state: BlockState = {
		code: options.code,
		highlighted,
		lines: [],
		editing: false,
		grid: options.grid,
		fontSize: options.fontSize,
		theme: options.theme,
		parser: options.parser,
		fontFamily: options.fontFamily,
		ink: options.fillColor ?? Color.rgba(255, 255, 255),
	};
	const group = yield* Scene.instantiate("Group", {
		...(options.position !== undefined ? { position: options.position } : {}),
	});
	for (const [line, slice] of sliceLines(highlighted).entries()) {
		const text = yield* Scene.instantiate(
			"Text",
			lineProps(state, line, slice),
		);
		yield* Scene.appendChild(group, text);
		state.lines.push(text);
	}
	return { [TypeId]: TypeId, group, "~code.state": state };
});

// ── edit transitions ─────────────────────────────────────────────────────

export interface EditOptions {
	/** How long, in scene time. */
	readonly duration: Duration.Input;
	/**
	 * An easing name or function, shared by every motion of the edit.
	 *
	 * @defaultValue `"linear"`
	 */
	readonly timing?: Timing.TimingInput | undefined;
}

const sameColor = (a: Color.Color, b: Color.Color): boolean => {
	const left = Color.bytes(a);
	const right = Color.bytes(b);
	return (
		left.r === right.r &&
		left.g === right.g &&
		left.b === right.b &&
		left.a === right.a
	);
};

const fragmentProps = (
	state: BlockState,
	text: string,
	at: Diff.GridPos,
	color: Color.Color,
	opacity: number,
): Runner.InstantiateProps<"Text"> => ({
	text,
	position: gridPosition(state, at),
	fontSize: state.fontSize,
	fillColor: color,
	baseline: "hanging",
	opacity,
	...(state.fontFamily !== undefined ? { fontFamily: state.fontFamily } : {}),
});

/**
 * Animate the block to a new source string.
 *
 * @remarks
 * The transition is planned by a deterministic diff — there is no
 * edit-marker DSL, and no base `edit` variant either: a block always has
 * concrete current code, so "an explicit origin" would mean teleporting
 * content, which is a rebuild, not an animation. Unchanged tokens slide
 * (across lines too, when an identical run migrates), removals fade out,
 * insertions fade in, recolored tokens tween mid-slide; every motion
 * shares the one duration and easing and the final frame equals a fresh
 * block of the new source, exactly.
 *
 * A block-level selection does not survive an edit — the transition lands
 * on the full highlight of the new source.
 *
 * Overlapping edits on one block are a loud defect.
 *
 * @param newCode - The complete new source.
 * @returns The block, so calls chain.
 */
export const editTo = dual<
	(
		newCode: string,
		options: EditOptions,
	) => (block: CodeBlock) => Effect.Effect<CodeBlock, never, Runner.Runner>,
	(
		block: CodeBlock,
		newCode: string,
		options: EditOptions,
	) => Effect.Effect<CodeBlock, never, Runner.Runner>
>(
	(args: IArguments) => isCodeBlock(args[0]),
	Effect.fnUntraced(function* (self, newCode, options) {
		const state = self["~code.state"];
		if (state.editing) {
			return yield* Effect.die(
				new Error("Code.editTo: an edit is already in progress on this block"),
			);
		}
		state.editing = true;
		yield* rejectTabs(newCode, "Code.editTo");
		const runner = yield* Runner.Runner;
		const target = Highlight.highlight(newCode, state.parser, state.theme);
		const plan = Diff.plan(state.highlighted, target, state.ink);

		// ── split (no tick — same frame, visually identical) ─────────────
		const split = new Set(plan.splitLines);
		for (const line of split) {
			const instance = state.lines[line];
			if (instance !== undefined) {
				runner.destroy(instance);
			}
		}
		const fragmentInstances: Array<Instance.Instance<"Text">> = [];
		const motions: Array<Effect.Effect<unknown, never, Runner.Runner>> = [];
		const timing = options.timing ?? "linear";

		for (const fragment of plan.fragments) {
			if (fragment.kind === "kept") {
				const instance = yield* Scene.instantiate(
					"Text",
					fragmentProps(
						state,
						fragment.text,
						fragment.from,
						fragment.fromColor,
						1,
					),
				);
				yield* Scene.appendChild(self.group, instance);
				fragmentInstances.push(instance);
				const from = fragment.from;
				const to = fragment.to;
				if (from.line !== to.line || from.col !== to.col) {
					motions.push(
						Motion.moveTo(
							instance,
							{ x: gridX(state, to.col), y: gridY(state, to.line) },
							options.duration,
							timing,
						),
					);
				}
				if (!sameColor(fragment.fromColor, fragment.toColor)) {
					motions.push(
						Motion.tweenTo(
							instance,
							{ fillColor: fragment.toColor },
							options.duration,
							timing,
						),
					);
				}
			} else if (fragment.kind === "removed") {
				const instance = yield* Scene.instantiate(
					"Text",
					fragmentProps(state, fragment.text, fragment.from, fragment.color, 1),
				);
				yield* Scene.appendChild(self.group, instance);
				fragmentInstances.push(instance);
				motions.push(Motion.fadeTo(instance, 0, options.duration, timing));
			} else {
				const instance = yield* Scene.instantiate(
					"Text",
					fragmentProps(state, fragment.text, fragment.to, fragment.color, 0),
				);
				yield* Scene.appendChild(self.group, instance);
				fragmentInstances.push(instance);
				motions.push(Motion.fadeTo(instance, 1, options.duration, timing));
			}
		}
		for (const move of plan.wholeLines) {
			const instance = state.lines[move.from];
			if (instance !== undefined && move.from !== move.to) {
				motions.push(
					Motion.moveTo(
						instance,
						{ y: gridY(state, move.to) },
						options.duration,
						timing,
					),
				);
			}
		}

		// ── animate: everything together, frame-exact landing ────────────
		yield* Scene.all(motions);

		// ── consolidate (no tick — same content as the landed frame) ─────
		const reusedByTarget = new Map(
			plan.wholeLines.map((move) => [move.to, move.from] as const),
		);
		const newSlices = sliceLines(target);
		const newLines: Array<Instance.Instance<"Text">> = [];
		for (const [line, slice] of newSlices.entries()) {
			const reusedFrom = reusedByTarget.get(line);
			const reused =
				reusedFrom === undefined ? undefined : state.lines[reusedFrom];
			if (reused !== undefined) {
				newLines.push(reused);
			} else {
				const text = yield* Scene.instantiate(
					"Text",
					lineProps(state, line, slice),
				);
				yield* Scene.appendChild(self.group, text);
				newLines.push(text);
			}
		}
		for (const instance of fragmentInstances) {
			runner.destroy(instance);
		}
		state.lines = newLines;
		state.code = newCode;
		state.highlighted = target;
		state.editing = false;
		return self;
	}),
);

// ── block selection ──────────────────────────────────────────────────────

export interface BlockSelectOptions {
	readonly duration: Duration.Input;
	readonly timing?: Timing.TimingInput | undefined;
	/** The backdrop color unselected code mixes toward. */
	readonly background: Color.Color;
	/**
	 * How far unselected colors move toward the background.
	 *
	 * @defaultValue `0.7`
	 */
	readonly amount?: number | undefined;
	/**
	 * The color of unspanned characters.
	 *
	 * @defaultValue the block's own ink (`fillColor` at creation)
	 */
	readonly baseColor?: Color.Color | undefined;
}

/**
 * Animate the block's selection: characters inside `ranges`
 * (whole-source coordinates, multi-line welcome) keep their colors,
 * everything else dims toward the background.
 *
 * @remarks
 * Lifts the single-Text selection over every line of the block, all lines
 * animating together. Ranges are always interpreted against the block's
 * CURRENT source. Selecting `[{ from: 0, to: code.length }]` restores the
 * full highlight; `[]` dims everything.
 *
 * @returns The block, so calls chain.
 */
export const selectTo = dual<
	(
		ranges: ReadonlyArray<Selection.Range>,
		options: BlockSelectOptions,
	) => (block: CodeBlock) => Effect.Effect<CodeBlock, never, Runner.Runner>,
	(
		block: CodeBlock,
		ranges: ReadonlyArray<Selection.Range>,
		options: BlockSelectOptions,
	) => Effect.Effect<CodeBlock, never, Runner.Runner>
>(
	(args: IArguments) => isCodeBlock(args[0]),
	Effect.fnUntraced(function* (self, ranges, options) {
		const state = self["~code.state"];
		const slices = sliceLines(state.highlighted);
		const selectOptions: Selection.SelectOptions = {
			duration: options.duration,
			timing: options.timing,
			background: options.background,
			amount: options.amount,
			baseColor: options.baseColor ?? state.ink,
		};
		const motions: Array<Effect.Effect<unknown, never, Runner.Runner>> = [];
		let offset = 0;
		for (const [line, slice] of slices.entries()) {
			const instance = state.lines[line];
			const end = offset + slice.text.length;
			if (instance !== undefined) {
				const local: Array<Selection.Range> = [];
				for (const range of ranges) {
					const from = Math.max(range.from, offset);
					const to = Math.min(range.to, end);
					if (from < to) {
						local.push({ from: from - offset, to: to - offset });
					}
				}
				motions.push(
					Selection.selectTo(
						instance,
						{ text: slice.text, spans: slice.spans },
						local,
						selectOptions,
					),
				);
			}
			offset = end + 1;
		}
		yield* Scene.all(motions);
		return self;
	}),
);
