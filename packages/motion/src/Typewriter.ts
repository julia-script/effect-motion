import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as Random from "effect/Random";
import type * as Schema from "effect/Schema";
import type * as Entity from "./Entity";
import * as Instance from "./Instance";
import * as RichText from "./RichText";
import * as Runner from "./Runner";
import * as Scene from "./Scene";
import type { TextContent } from "./shapes/Text";

/**
 * Typewriter animation: reveal and rewrite an entity's `text` the way a
 * person types. Built on {@link RichText}: it diffs the current text
 * against the target and replays the difference as keystrokes, backspacing
 * only what changed — region by region — rather than retyping the line.
 */

/** A single planned keystroke: the full text after it, and which key it was. */
export interface Keystroke {
	readonly content: TextContent;
	readonly kind: "delete" | "insert";
}

type Segment =
	| { readonly type: "keep"; readonly units: ReadonlyArray<RichText.Unit> }
	| {
			readonly type: "change";
			readonly dels: ReadonlyArray<RichText.Unit>;
			readonly ins: ReadonlyArray<RichText.Unit>;
	  };

// group the flat op stream into keep-runs and change-runs (a change-run's
// deletes and inserts gathered separately, whatever order the diff emitted)
const segmentize = (
	ops: ReadonlyArray<RichText.Op>,
): ReadonlyArray<Segment> => {
	const segments: Array<Segment> = [];
	let i = 0;
	while (i < ops.length) {
		// biome-ignore lint/style/noNonNullAssertion: i < length
		if (ops[i]!.op === "keep") {
			const units: Array<RichText.Unit> = [];
			while (i < ops.length && ops[i]!.op === "keep") {
				// biome-ignore lint/style/noNonNullAssertion: i < length
				units.push(ops[i]!.unit);
				i++;
			}
			segments.push({ type: "keep", units });
		} else {
			const dels: Array<RichText.Unit> = [];
			const ins: Array<RichText.Unit> = [];
			while (i < ops.length && ops[i]!.op !== "keep") {
				// biome-ignore lint/style/noNonNullAssertion: i < length
				const op = ops[i]!;
				if (op.op === "delete") {
					dels.push(op.unit);
				} else {
					ins.push(op.unit);
				}
				i++;
			}
			segments.push({ type: "change", dels, ins });
		}
	}
	return segments;
};

export interface KeystrokeOptions {
	/** grapheme (default) or whole-word reveal */
	readonly granularity?: RichText.Granularity;
}

/**
 * Plan the keystrokes that turn `from` into `to` — one intermediate
 * `TextContent` per keystroke, each tagged `delete` or `insert`, ending
 * exactly at `to`. Change regions are handled left to right; within a
 * region the removed units are backspaced one at a time and then the added
 * units typed one at a time, leaving text outside the region untouched. So
 * two separate edits are made locally, one after the other — not
 * backspace-everything-then-retype. Equal `from` and `to` plan nothing.
 * Pure: no scene, no effects.
 */
export const keystrokes = (
	from: TextContent,
	to: TextContent,
	options?: KeystrokeOptions,
): ReadonlyArray<Keystroke> => {
	const granularity = options?.granularity ?? "grapheme";
	const ops = RichText.diff(
		RichText.flatten(from, granularity),
		RichText.flatten(to, granularity),
	);
	const segments = segmentize(ops);

	// suffixAfter[k] = OLD units strictly to the right of segment k (keeps,
	// plus not-yet-reached deletes) — the tail held in place while region k
	// is edited. Built from the right.
	const suffixAfter: Array<ReadonlyArray<RichText.Unit>> = new Array(
		segments.length + 1,
	);
	suffixAfter[segments.length] = [];
	for (let k = segments.length - 1; k >= 0; k--) {
		// biome-ignore lint/style/noNonNullAssertion: k in range
		const seg = segments[k]!;
		const own = seg.type === "keep" ? seg.units : seg.dels;
		// biome-ignore lint/style/noNonNullAssertion: filled at k+1 already
		suffixAfter[k] = [...own, ...suffixAfter[k + 1]!];
	}

	const strokes: Array<Keystroke> = [];
	const before: Array<RichText.Unit> = [];
	for (let k = 0; k < segments.length; k++) {
		// biome-ignore lint/style/noNonNullAssertion: k in range
		const seg = segments[k]!;
		if (seg.type === "keep") {
			before.push(...seg.units);
			continue;
		}
		// biome-ignore lint/style/noNonNullAssertion: k+1 in range
		const suffix = suffixAfter[k + 1]!;
		// backspace: drop the region's deletes from the tail, one at a time
		for (let d = seg.dels.length - 1; d >= 0; d--) {
			strokes.push({
				kind: "delete",
				content: RichText.rebuild([
					...before,
					...seg.dels.slice(0, d),
					...suffix,
				]),
			});
		}
		// type: add the region's inserts, one at a time
		const typed: Array<RichText.Unit> = [];
		for (const unit of seg.ins) {
			typed.push(unit);
			strokes.push({
				kind: "insert",
				content: RichText.rebuild([...before, ...typed, ...suffix]),
			});
		}
		before.push(...seg.ins);
	}
	return strokes;
};

// ── animator ───────────────────────────────────────────────────────────

export interface TypewriteOptions extends KeystrokeOptions {
	/** typing speed in clusters per second (default 24) */
	readonly cps?: number;
	/** backspacing speed in clusters per second (default `cps * 2` — deleting reads faster than typing) */
	readonly deleteCps?: number;
	/** 0..1 per-key hold variance, drawn from the scene's seeded Random (default 0) */
	readonly jitter?: number;
}

// entities this animator applies to: data must carry a rich-text `text` field
type HasText = { readonly Type: { readonly text: TextContent } };

const setText = <Data extends Schema.Top>(
	data: Data["Type"],
	text: TextContent,
): Data["Type"] =>
	// Data["Type"] is opaque to TS, so spread is disallowed — assign + cast
	Object.assign({}, data, { text }) as Data["Type"];

const run = Effect.fnUntraced(function* <
	Name extends string,
	Data extends Schema.Top & HasText,
	Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
	E = never,
	R = never,
>(
	instanceOrEffect: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	from: TextContent | undefined,
	to: TextContent,
	options?: TypewriteOptions,
) {
	const instance = yield* Instance.flatten(instanceOrEffect);
	const current = yield* Scene.data(instance);
	// explicit origin starts the reveal there (mirrors tween's from); the
	// To form reads the origin from the instance's current text
	const origin = from ?? (current as { readonly text: TextContent }).text;
	if (from !== undefined) {
		yield* Scene.update(instance, (data) => setText<Data>(data, from));
	}

	const strokes = keystrokes(origin, to, options);
	if (strokes.length === 0) {
		return instance;
	}

	const runner = yield* Runner.Runner;
	const { frameRate } = runner.settings;
	const cps = options?.cps ?? 24;
	const deleteCps = options?.deleteCps ?? cps * 2;
	const jitter = options?.jitter ?? 0;
	const typeFrames = Math.max(1, Math.round(frameRate / cps));
	const deleteFrames = Math.max(1, Math.round(frameRate / deleteCps));

	for (const stroke of strokes) {
		yield* Scene.update(instance, (data) =>
			setText<Data>(data, stroke.content),
		);
		const base = stroke.kind === "delete" ? deleteFrames : typeFrames;
		let frames = base;
		if (jitter > 0) {
			// seeded: same seed → same pacing, so scenes stay deterministic
			const wobble = yield* Random.nextBetween(-1, 1);
			frames = Math.max(1, Math.round(base * (1 + jitter * wobble)));
		}
		for (let f = 0; f < frames; f++) {
			yield* Scene.tick;
		}
	}
	return instance;
});

const firstArgIsInstance = (args: IArguments) => Instance.isInstance(args[0]);

/**
 * Type an entity's `text` toward `to`, starting from its current text:
 * diffs the two and replays the change as keystrokes (backspacing only
 * what differs, region by region). Revealing from empty text is the
 * degenerate all-insert case — a plain letter-by-letter reveal. Dual:
 * `typewriteTo(instance, to, options?)` or
 * `instance.pipe(typewriteTo(to, options?))`. Resolves with the instance,
 * so it chains.
 */
export const typewriteTo = dual<
	<
		Name extends string,
		Data extends Schema.Top & HasText,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
	>(
		to: TextContent,
		options?: TypewriteOptions,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>,
	<
		Name extends string,
		Data extends Schema.Top & HasText,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
		E = never,
		R = never,
	>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
		to: TextContent,
		options?: TypewriteOptions,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>
>(firstArgIsInstance, (instance, to, options) =>
	run(instance, undefined, to, options),
);

/**
 * Like `typewriteTo`, but from an explicit `from` text (set before the
 * reveal begins). Dual: `typewrite(instance, from, to, options?)` or
 * `instance.pipe(typewrite(from, to, options?))`.
 */
export const typewrite = dual<
	<
		Name extends string,
		Data extends Schema.Top & HasText,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
	>(
		from: TextContent,
		to: TextContent,
		options?: TypewriteOptions,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>,
	<
		Name extends string,
		Data extends Schema.Top & HasText,
		Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
		E = never,
		R = never,
	>(
		instance: Instance.InstanceOrEffect<Name, Data, Traits, E, R>,
		from: TextContent,
		to: TextContent,
		options?: TypewriteOptions,
	) => Effect.Effect<
		Instance.Instance<Name, Data, Traits>,
		E,
		R | Runner.Runner
	>
>(firstArgIsInstance, (instance, from, to, options) =>
	run(instance, from, to, options),
);
