/**
 * Selection over highlighted code: keep some ranges at full color and dim
 * everything else toward the backdrop — the "look here" gesture of a code
 * explainer.
 *
 * Dimming is a COLOR MIX, not an alpha change: the glyph pipeline's opacity
 * is uniform per mesh, and over the solid backdrop code sits on, mixing
 * toward the background color is visually identical. `dim` is the pure
 * derivation (span data in, span data out); `select`/`selectTo` animate
 * between selections frame-exactly.
 */
import type * as Duration from "effect/Duration";
import type * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Instance from "effect-motion/Instance";
import * as Motion from "effect-motion/Motion";
import type * as Runner from "effect-motion/Runner";
import type * as Timing from "effect-motion/Timing";
import type { Highlighted } from "./Highlight.js";

/** A character range, `from` inclusive, `to` exclusive (UTF-16 indices). */
export interface Range {
	readonly from: number;
	readonly to: number;
}

export interface DimOptions {
	/** The backdrop color unselected code mixes toward. */
	readonly background: Color.Color;
	/**
	 * The color of unspanned characters — the Text's `fillColor`. Required
	 * because span data cannot see the entity, and unspanned characters must
	 * dim too.
	 */
	readonly baseColor: Color.Color;
	/**
	 * How far unselected colors move toward the background, 0 (no dim) to 1
	 * (invisible).
	 *
	 * @defaultValue `0.7`
	 */
	readonly amount?: number | undefined;
}

const DEFAULT_AMOUNT = 0.7;

/** ascending unique boundary positions, clamped to [0, length] */
const boundariesOf = (
	length: number,
	...sources: ReadonlyArray<ReadonlyArray<Range>>
): Array<number> => {
	const set = new Set([0, length]);
	for (const ranges of sources) {
		for (const range of ranges) {
			set.add(Math.max(0, Math.min(length, range.from)));
			set.add(Math.max(0, Math.min(length, range.to)));
		}
	}
	return [...set].sort((a, b) => a - b);
};

/** the color painting position `at`, given sorted spans and the base */
const effectiveColor = (
	spans: ReadonlyArray<Entity.Span>,
	at: number,
	baseColor: Color.Color,
): Color.Color => {
	for (const span of spans) {
		if (span.from <= at && at < span.to) {
			return span.fillColor;
		}
		if (span.from > at) {
			break;
		}
	}
	return baseColor;
};

const sameColor = (a: Color.Color, b: Color.Color): boolean => {
	if (a === b) {
		return true;
	}
	const left = Color.bytes(a);
	const right = Color.bytes(b);
	return (
		left.r === right.r &&
		left.g === right.g &&
		left.b === right.b &&
		left.a === right.a
	);
};

/** whole-string cover from per-boundary segment colors, equal runs merged */
const coverFrom = (
	boundaries: ReadonlyArray<number>,
	colorAt: (segmentStart: number) => Color.Color,
): Array<Entity.Span> => {
	const spans: Array<Entity.Span> = [];
	for (let i = 0; i < boundaries.length - 1; i++) {
		const from = boundaries[i] ?? 0;
		const to = boundaries[i + 1] ?? 0;
		if (from >= to) {
			continue;
		}
		const fillColor = colorAt(from);
		const previous = spans.at(-1);
		if (
			previous !== undefined &&
			previous.to === from &&
			sameColor(previous.fillColor, fillColor)
		) {
			spans[spans.length - 1] = Entity.Span.make({
				from: previous.from,
				to,
				fillColor,
			});
		} else {
			spans.push(Entity.Span.make({ from, to, fillColor }));
		}
	}
	return spans;
};

const inAny = (ranges: ReadonlyArray<Range>, at: number): boolean =>
	ranges.some((range) => range.from <= at && at < range.to);

/**
 * Derive the dimmed span set for a selection.
 *
 * @remarks
 * Characters inside `ranges` keep their highlighted colors; every other
 * character — spanned or plain — paints its effective color mixed toward
 * `background`. The result covers the whole string, so it fully replaces
 * the Text's `spans`. Pure data in, pure data out.
 *
 * @param highlighted - The (un-dimmed) highlight to select within.
 * @param ranges - The character ranges to keep at full color; `[]` dims
 *   everything.
 */
export const dim = (
	highlighted: Highlighted,
	ranges: ReadonlyArray<Range>,
	options: DimOptions,
): Highlighted => {
	const amount = options.amount ?? DEFAULT_AMOUNT;
	const length = highlighted.text.length;
	const boundaries = boundariesOf(length, highlighted.spans, ranges);
	const spans = coverFrom(boundaries, (at) => {
		const effective = effectiveColor(highlighted.spans, at, options.baseColor);
		return inAny(ranges, at)
			? effective
			: Color.mix(effective, options.background, amount, "lab");
	});
	return { text: highlighted.text, spans };
};

export interface SelectOptions extends DimOptions {
	/** How long, in scene time. */
	readonly duration: Duration.Input;
	/**
	 * An easing name or function.
	 *
	 * @defaultValue `"linear"`
	 */
	readonly timing?: Timing.TimingInput | undefined;
}

/**
 * The per-frame interpolation plan: boundaries are the UNION of both span
 * sets' edges, fixed once at animation start, so only colors move between
 * frames and the layout never re-shapes mid-animation.
 */
const interpolator = (
	origin: ReadonlyArray<Entity.Span> | undefined,
	target: Highlighted,
	baseColor: Color.Color,
): ((
	t: number,
	data: Entity.EntityByTag<"Text">,
) => Entity.EntityByTag<"Text">) => {
	let plan:
		| {
				readonly boundaries: ReadonlyArray<number>;
				readonly fromSpans: ReadonlyArray<Entity.Span>;
		  }
		| undefined;
	return (t, data) => {
		plan ??= (() => {
			const fromSpans = origin ?? data.spans ?? [];
			return {
				boundaries: boundariesOf(target.text.length, fromSpans, target.spans),
				fromSpans,
			};
		})();
		if (t >= 1) {
			// land EXACTLY on the derived target set — house invariant
			return { ...data, spans: target.spans };
		}
		const { boundaries, fromSpans } = plan;
		const spans = coverFrom(boundaries, (at) =>
			Color.mix(
				effectiveColor(fromSpans, at, baseColor),
				effectiveColor(target.spans, at, baseColor),
				t,
				"lab",
			),
		);
		return { ...data, spans };
	};
};

/**
 * Animate a Text's selection: dim everything outside `ranges` over
 * `duration`, starting from the spans the instance currently carries.
 *
 * @remarks
 * The target is `dim(highlighted, ranges, options)`; pass the same
 * (un-dimmed) {@link Highlighted} to every selection over one Text, so
 * consecutive selections re-derive from full color rather than compounding
 * dims. Span boundaries are fixed for the whole animation (the union of
 * start and target edges) — only colors interpolate, so glyphs never
 * re-shape mid-tween. The final frame lands exactly on the target set.
 *
 * Selecting `[{ from: 0, to: text.length }]` restores the full highlight;
 * `[]` dims everything.
 *
 * @param highlighted - The un-dimmed highlight to select within.
 * @param ranges - The character ranges to keep at full color.
 * @returns The instance, so animators chain.
 * @see {@link select} to start from an explicit span set.
 *
 * @example
 * ```typescript
 * yield* code.pipe(
 * 	Selection.selectTo(snippet, [{ from: 0, to: 5 }], {
 * 		duration: "500 millis",
 * 		background: backdrop,
 * 		baseColor: ink,
 * 	}),
 * );
 * ```
 */
export const selectTo = dual<
	(
		highlighted: Highlighted,
		ranges: ReadonlyArray<Range>,
		options: SelectOptions,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<"Text", E, R>,
	) => Effect.Effect<Instance.Instance<"Text">, E, R | Runner.Runner>,
	<E = never, R = never>(
		instance: Instance.InstanceOrEffect<"Text", E, R>,
		highlighted: Highlighted,
		ranges: ReadonlyArray<Range>,
		options: SelectOptions,
	) => Effect.Effect<Instance.Instance<"Text">, E, R | Runner.Runner>
>(
	(args: IArguments) => Instance.isInstance(args[0]),
	(instance, highlighted, ranges, options) =>
		animateSelection(instance, undefined, highlighted, ranges, options),
);

/**
 * Like {@link selectTo}, but starting from an explicit span set — reach for
 * this when the animation must begin from a known selection state no matter
 * what the last animation left behind.
 *
 * @param from - The starting span set (e.g. a previous `dim(...)`'s spans).
 */
export const select = dual<
	(
		from: ReadonlyArray<Entity.Span>,
		highlighted: Highlighted,
		ranges: ReadonlyArray<Range>,
		options: SelectOptions,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<"Text", E, R>,
	) => Effect.Effect<Instance.Instance<"Text">, E, R | Runner.Runner>,
	<E = never, R = never>(
		instance: Instance.InstanceOrEffect<"Text", E, R>,
		from: ReadonlyArray<Entity.Span>,
		highlighted: Highlighted,
		ranges: ReadonlyArray<Range>,
		options: SelectOptions,
	) => Effect.Effect<Instance.Instance<"Text">, E, R | Runner.Runner>
>(
	(args: IArguments) => Instance.isInstance(args[0]),
	(instance, from, highlighted, ranges, options) =>
		animateSelection(instance, from, highlighted, ranges, options),
);

const animateSelection = <E, R>(
	instance: Instance.InstanceOrEffect<"Text", E, R>,
	from: ReadonlyArray<Entity.Span> | undefined,
	highlighted: Highlighted,
	ranges: ReadonlyArray<Range>,
	options: SelectOptions,
): Effect.Effect<Instance.Instance<"Text">, E, R | Runner.Runner> =>
	Motion.drive(
		instance,
		options.duration,
		options.timing ?? "linear",
		interpolator(from, dim(highlighted, ranges, options), options.baseColor),
	);
