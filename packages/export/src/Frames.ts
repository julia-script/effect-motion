import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import type { Runner } from "effect-motion";
import { Scene } from "effect-motion";

/**
 * Frame sampling: pick a handful of frames out of a scene and get their exact
 * state — the GPU-free half of `motion frames`. Runs the scene through
 * `Scene.stream` only; nothing here touches the renderer, so it works on any
 * machine (the stills/contact-sheet half lives with the GPU renderer).
 */

/** One requested point in a scene. */
export type Selector =
	| { readonly _tag: "Frame"; readonly frame: number }
	| { readonly _tag: "Time"; readonly seconds: number }
	| { readonly _tag: "Percent"; readonly percent: number }
	| { readonly _tag: "End" };

/**
 * Which frames to sample: explicit points, or N evenly spaced frames — over
 * the whole scene, or over `range` (both ends included).
 */
export type Selection =
	| { readonly _tag: "At"; readonly selectors: ReadonlyArray<Selector> }
	| {
			readonly _tag: "Count";
			readonly count: number;
			readonly range?: { readonly from: Selector; readonly to: Selector };
	  };

/** An invalid selection, an out-of-range frame, or an unanswerable one. */
export class FrameSelectionError extends Data.TaggedError(
	"FrameSelectionError",
)<{ readonly message: string }> {}

/** A sampled frame: its index, its time in seconds, and its full state. */
export interface Sample<Resources = never> {
	readonly frame: number;
	readonly time: number;
	readonly data: Scene.Frame<Resources>;
}

const fail = (message: string) =>
	Effect.fail(new FrameSelectionError({ message }));

const num = String.raw`(\d+(?:\.\d+)?)`;
const patterns = {
	frame: /^(\d+)$/,
	seconds: new RegExp(`^${num}s$`),
	millis: new RegExp(`^${num}ms$`),
	percent: new RegExp(`^${num}%$`),
	count: /^count\s+(\d+)(?:\s+(\S+)\.\.(\S+))?$/,
};

const parseSelector = (
	token: string,
): Effect.Effect<Selector, FrameSelectionError> => {
	if (token === "end") return Effect.succeed({ _tag: "End" });
	let m = patterns.frame.exec(token);
	if (m) return Effect.succeed({ _tag: "Frame", frame: Number(m[1]) });
	m = patterns.millis.exec(token);
	if (m) return Effect.succeed({ _tag: "Time", seconds: Number(m[1]) / 1000 });
	m = patterns.seconds.exec(token);
	if (m) return Effect.succeed({ _tag: "Time", seconds: Number(m[1]) });
	m = patterns.percent.exec(token);
	if (m) {
		const percent = Number(m[1]);
		return percent > 100
			? fail(`Invalid frame selector "${token}": a percentage must be 0–100%.`)
			: Effect.succeed({ _tag: "Percent", percent });
	}
	return fail(
		`Invalid frame selector "${token}". Use a frame index (30), a time (1.5s, 500ms), a percentage (50%), or "end".`,
	);
};

/**
 * Parse a selection string: a comma-separated list of frame indices (`0,30`),
 * times (`1.5s`, `500ms`), percentages (`50%`) and `end` — or `count N` for N
 * evenly spaced frames including the first and last, optionally within a
 * range of any two selectors (`count 5 7.5s..8.5s`, `count 4 50%..end`).
 */
export const parse = (
	input: string,
): Effect.Effect<Selection, FrameSelectionError> => {
	const trimmed = input.trim();
	const count = patterns.count.exec(trimmed);
	if (count) {
		const n = Number(count[1]);
		if (n < 1) {
			return fail(
				`Invalid frame count "${trimmed}": count must be at least 1.`,
			);
		}
		const [, , from, to] = count;
		if (from === undefined || to === undefined) {
			return Effect.succeed({ _tag: "Count", count: n });
		}
		return Effect.map(
			Effect.all([parseSelector(from), parseSelector(to)]),
			([f, t]) => ({
				_tag: "Count" as const,
				count: n,
				range: { from: f, to: t },
			}),
		);
	}
	const tokens = trimmed.split(",").map((t) => t.trim());
	if (tokens.some((t) => t === "")) {
		return fail(`Invalid frame selection "${input}": empty selector.`);
	}
	return Effect.map(Effect.forEach(tokens, parseSelector), (selectors) => ({
		_tag: "At" as const,
		selectors,
	}));
};

const describe = (s: Selector): string => {
	switch (s._tag) {
		case "Frame":
			return String(s.frame);
		case "Time":
			return `${s.seconds}s`;
		case "Percent":
			return `${s.percent}%`;
		case "End":
			return "end";
	}
};

const endRelative = (s: Selector) => s._tag === "Percent" || s._tag === "End";

const needsLength = (selection: Selection): boolean =>
	selection._tag === "Count"
		? selection.range === undefined ||
			endRelative(selection.range.from) ||
			endRelative(selection.range.to)
		: selection.selectors.some(endRelative);

// resolve a selection to frame indices (each with a label for error messages)
const resolve = (
	selection: Selection,
	frameRate: number,
	length: number | undefined,
): Effect.Effect<
	ReadonlyArray<{ readonly frame: number; readonly label: string }>,
	FrameSelectionError
> => {
	// needsLength guarantees `length` is known whenever it is read below
	const last = (length ?? 1) - 1;
	const frameOf = (s: Selector): number => {
		switch (s._tag) {
			case "Frame":
				return s.frame;
			case "Time":
				return Math.round(s.seconds * frameRate);
			case "Percent":
				return Math.round((s.percent / 100) * last);
			case "End":
				return last;
		}
	};
	if (selection._tag === "Count") {
		const { range } = selection;
		const from = range === undefined ? 0 : frameOf(range.from);
		const to = range === undefined ? last : frameOf(range.to);
		const label =
			range === undefined
				? `count ${selection.count}`
				: `count ${selection.count} ${describe(range.from)}..${describe(range.to)}`;
		if (to < from) {
			return fail(
				`Invalid frame range "${label}": it starts at frame ${from}, after its end at frame ${to}.`,
			);
		}
		// clamp to the span: with n ≤ span the spacing is ≥ 1 frame, so the
		// rounded indices are distinct (no repeated frames)
		const n = Math.min(selection.count, to - from + 1);
		return Effect.succeed(
			Array.from({ length: n }, (_, i) => ({
				frame: n === 1 ? from : from + Math.round((i * (to - from)) / (n - 1)),
				label,
			})),
		);
	}
	return Effect.succeed(
		selection.selectors.map((s) => ({ frame: frameOf(s), label: describe(s) })),
	);
};

/**
 * Sample frames from a scene, in the order requested (duplicates kept).
 * `count N` larger than the scene (or its range) clamps to every frame, once
 * each.
 *
 * The scene ends where its video ends: when the body and every fork are
 * done. Backgrounds and tails still running after `Scene.finish` are cut
 * there, exactly as `Video.render` and the player cut them, so `end` is
 * the last frame that ever renders.
 *
 * Only `%`, `end` and a range-less `count` need the scene's length; for those the scene is
 * run once to the end to count its frames (no rendering), then again to pick
 * them. A selection needing the end of an infinite scene
 * (`maxFrames: Infinity`) fails; a frame past the scene's end fails naming
 * the frame and the scene length.
 *
 * ponytail: the length pass re-runs the scene (scenes are pure functions of
 * settings, so both passes agree); buffer frames instead if scenes get slow
 * enough for a second pass to matter.
 */
export const sample = <E, R>(
	scene: Scene.Scene<E, R>,
	selection: Selection | string,
	settings: Partial<Runner.Settings> = {},
) =>
	Effect.scoped(
		Effect.gen(function* () {
			const sel =
				typeof selection === "string" ? yield* parse(selection) : selection;

			let length: number | undefined;
			if (needsLength(sel)) {
				if (settings.maxFrames === Number.POSITIVE_INFINITY) {
					return yield* fail(
						`Selection needs the scene's end ("%", "end" or a count over the whole scene), but the scene is infinite (maxFrames: Infinity). Select frame indices or times, or a count over a range of them, instead.`,
					);
				}
				length = yield* Stream.runCount(Scene.stream(scene, settings));
			}

			const [head, rest] = yield* Stream.peel(
				Scene.stream(scene, settings),
				Sink.head(),
			);
			if (head._tag === "None") {
				return yield* fail("The scene produced no frames to sample.");
			}
			const first = head.value;
			const wanted = yield* resolve(sel, first.frameRate, length);
			const maxFrame = Math.max(...wanted.map((w) => w.frame));

			const wantedFrames = new Set(wanted.map((w) => w.frame));
			const picked = new Map<number, typeof first>();
			let seen = 0;
			yield* Stream.runForEach(
				Stream.concat(Stream.make(first), rest).pipe(Stream.take(maxFrame + 1)),
				(frame) =>
					Effect.sync(() => {
						if (wantedFrames.has(seen)) picked.set(seen, frame);
						seen++;
					}),
			);

			const outOfRange = wanted.find((w) => w.frame >= seen);
			if (outOfRange !== undefined) {
				return yield* fail(
					`Frame ${outOfRange.frame}${outOfRange.label === String(outOfRange.frame) ? "" : ` (${outOfRange.label})`} is out of range: the scene has ${seen} frames (0–${seen - 1}).`,
				);
			}
			// every wanted frame is < seen, so it was picked; `?? first` is unreachable
			return wanted.map((w) => ({
				frame: w.frame,
				time: w.frame / first.frameRate,
				data: picked.get(w.frame) ?? first,
			}));
		}),
	);

/** A sampled frame as plain JSON: index, time, and the frame's data. */
export interface FrameState {
	readonly frame: number;
	readonly time: number;
	readonly width: number;
	readonly height: number;
	readonly frameRate: number;
	readonly camera: Scene.Frame["camera"];
	readonly root: string;
	readonly instances: Scene.Frame["instances"];
}

/** Project samples to plain, `JSON.stringify`-ready state. */
export const toJson = (
	samples: ReadonlyArray<Sample<unknown>>,
): ReadonlyArray<FrameState> =>
	samples.map(({ frame, time, data }) => ({
		frame,
		time,
		width: data.width,
		height: data.height,
		frameRate: data.frameRate,
		camera: data.camera,
		root: data.root,
		instances: data.instances,
	}));
