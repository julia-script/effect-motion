import { parser } from "@lezer/javascript";
import { Effect } from "effect";
import * as Stream from "effect/Stream";
import * as Color from "effect-motion/Color";
import type * as Entity from "effect-motion/Entity";
import * as Scene from "effect-motion/Scene";
import { describe, expect, it } from "vitest";
import * as Highlight from "../src/Highlight.js";
import * as Selection from "../src/Selection.js";
import { unreachable } from "./support/raise.js";

const code = 'const x = "hi"';
const snippet = Highlight.highlight(code, parser, Highlight.defaultTheme);

// Color instances carry a per-instance `pipe` function, so toEqual never
// matches two of them — compare data through a JSON round-trip instead
const plain = <A>(value: A): unknown =>
	JSON.parse(JSON.stringify(value ?? null));
const background = Color.rgba(10, 10, 20);
const baseColor = Color.rgba(220, 220, 230);
const options = { background, baseColor } as const;
const stringRange = { from: code.indexOf('"'), to: code.length } as const;

describe("Selection.dim", () => {
	it("keeps selected ranges and dims the remainder, whole-string cover", () => {
		const dimmed = Selection.dim(snippet, [stringRange], options);
		// contiguous cover of the whole string
		expect(dimmed.spans[0]?.from).toBe(0);
		expect(dimmed.spans.at(-1)?.to).toBe(code.length);
		for (let i = 1; i < dimmed.spans.length; i++) {
			expect(dimmed.spans[i]?.from).toBe(dimmed.spans[i - 1]?.to);
		}
		// the selected string keeps its highlight color
		const kept = dimmed.spans.find((span) => span.from === stringRange.from);
		expect(plain(kept?.fillColor)).toEqual(
			plain(Highlight.defaultTheme.string),
		);
		// the keyword dims toward the background
		const keyword = Highlight.defaultTheme.keyword ?? Color.rgba(0, 0, 0);
		expect(plain(dimmed.spans[0]?.fillColor)).toEqual(
			plain(Color.mix(keyword, background, 0.7, "lab")),
		);
		// unspanned characters dim from the base color
		const unspanned = dimmed.spans.find(
			(span) => span.from <= 6 && 6 < span.to,
		);
		expect(plain(unspanned?.fillColor)).toEqual(
			plain(Color.mix(baseColor, background, 0.7, "lab")),
		);
	});

	it("an empty selection dims everything", () => {
		const dimmed = Selection.dim(snippet, [], options);
		for (const span of dimmed.spans) {
			expect(plain(span.fillColor)).not.toEqual(
				plain(Highlight.defaultTheme.string),
			);
		}
	});
});

// runs a scene and extracts each frame's Text spans
const spansPerFrame = async (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
): Promise<Array<ReadonlyArray<Entity.Span> | undefined>> => {
	const scene = Scene.make(make as never, { width: 500, height: 300 });
	const frames = await Effect.runPromise(
		Scene.stream(scene as never).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
	);
	return [...frames].map((frame) => {
		const entry =
			Object.entries(frame.instances).find(([id]) => id !== frame.root)?.[1] ??
			unreachable();
		return (entry.data as Entity.EntityByTag<"Text">).spans;
	});
};

describe("Selection.selectTo", () => {
	const selectOptions = { ...options, duration: "1 second" } as const;

	it("lands exactly on the dim target at the final frame", async () => {
		const target = Selection.dim(snippet, [stringRange], options);
		const track = await spansPerFrame(function* () {
			const text = yield* Scene.instantiate("Text", {
				text: snippet.text,
				spans: snippet.spans,
			});
			yield* Selection.selectTo(text, snippet, [stringRange], selectOptions);
		});
		// 60 drive frames at the default 60fps; the last is exactly t = 1
		expect(plain(track[59])).toEqual(plain(target.spans));
		// mid-animation the colors are en route: neither start nor target
		expect(plain(track[29])).not.toEqual(plain(target.spans));
		expect(plain(track[29])).not.toEqual(plain(snippet.spans));
	});

	it("boundaries stay fixed mid-animation — only colors move", async () => {
		const track = await spansPerFrame(function* () {
			const text = yield* Scene.instantiate("Text", {
				text: snippet.text,
				spans: snippet.spans,
			});
			yield* Selection.selectTo(text, snippet, [stringRange], selectOptions);
		});
		const edgesOf = (spans: ReadonlyArray<Entity.Span> | undefined) =>
			(spans ?? []).map((span) => `${span.from}:${span.to}`).join("|");
		// every interior frame shares one boundary set (merging equal-colored
		// neighbors could only differ at the exact endpoints)
		expect(edgesOf(track[10])).toBe(edgesOf(track[40]));
	});

	it("re-running the scene reproduces identical frames", async () => {
		const run = () =>
			spansPerFrame(function* () {
				const text = yield* Scene.instantiate("Text", {
					text: snippet.text,
					spans: snippet.spans,
				});
				yield* Selection.selectTo(text, snippet, [stringRange], selectOptions);
			});
		expect(plain(await run())).toEqual(plain(await run()));
	});

	it("pipeable form behaves identically", async () => {
		const target = Selection.dim(snippet, [stringRange], options);
		const track = await spansPerFrame(function* () {
			const text = yield* Scene.instantiate("Text", {
				text: snippet.text,
				spans: snippet.spans,
			});
			yield* text.pipe(
				Selection.selectTo(snippet, [stringRange], selectOptions),
			);
		});
		expect(plain(track.at(-1))).toEqual(plain(target.spans));
	});

	it("select starts from an explicit span set", async () => {
		// begin from an everything-dimmed state no matter what the instance
		// carries — the base/To origin rule
		const dimmedAll = Selection.dim(snippet, [], options);
		const target = Selection.dim(snippet, [stringRange], options);
		const track = await spansPerFrame(function* () {
			const text = yield* Scene.instantiate("Text", {
				text: snippet.text,
				spans: snippet.spans,
			});
			yield* Selection.select(
				text,
				dimmedAll.spans,
				snippet,
				[stringRange],
				selectOptions,
			);
		});
		expect(plain(track.at(-1))).toEqual(plain(target.spans));
	});
});
