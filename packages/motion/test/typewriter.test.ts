import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import type { TextContent } from "../src/shapes/Text";
import * as Typewriter from "../src/Typewriter";

const texts = (strokes: ReadonlyArray<Typewriter.Keystroke>) =>
	strokes.map((s) => s.content);
const kinds = (strokes: ReadonlyArray<Typewriter.Keystroke>) =>
	strokes.map((s) => s.kind);

describe("Typewriter.keystrokes", () => {
	it("reveals from empty, one insert per grapheme, landing on target", () => {
		const strokes = Typewriter.keystrokes("", "Hi");
		expect(texts(strokes)).toEqual(["H", "Hi"]);
		expect(kinds(strokes)).toEqual(["insert", "insert"]);
	});

	it("clears to empty by backspacing", () => {
		const strokes = Typewriter.keystrokes("Hi", "");
		expect(texts(strokes)).toEqual(["H", ""]);
		expect(kinds(strokes)).toEqual(["delete", "delete"]);
	});

	it("edits in place, keeping the untouched suffix", () => {
		const strokes = Typewriter.keystrokes("cat", "cut");
		// backspace the 'a' (t stays), then type the 'u'
		expect(texts(strokes)).toEqual(["ct", "cut"]);
		expect(kinds(strokes)).toEqual(["delete", "insert"]);
	});

	it("handles two separate edits one region at a time", () => {
		const strokes = Typewriter.keystrokes("cat and dog", "cut and dig");
		expect(texts(strokes)).toEqual([
			// region 1: cat -> cut, everything after left alone
			"ct and dog",
			"cut and dog",
			// region 2: dog -> dig, everything before already final
			"cut and dg",
			"cut and dig",
		]);
		expect(kinds(strokes)).toEqual(["delete", "insert", "delete", "insert"]);
	});

	it("appends to a shared prefix without retyping it", () => {
		const strokes = Typewriter.keystrokes("Hello", "Hello!");
		expect(texts(strokes)).toEqual(["Hello!"]);
	});

	it("plans nothing when from equals to", () => {
		expect(Typewriter.keystrokes("same", "same")).toEqual([]);
	});

	it("types whole words at word granularity", () => {
		const strokes = Typewriter.keystrokes("", "hi there", {
			granularity: "word",
		});
		expect(texts(strokes)).toEqual(["hi", "hi ", "hi there"]);
	});

	it("ends exactly on a rich-text target", () => {
		const target = {
			type: "root",
			children: [
				{
					type: "paragraph",
					children: [
						{ type: "text", value: "hi " },
						{ type: "strong", children: [{ type: "text", value: "bold" }] },
					],
				},
			],
		} satisfies TextContent;
		const strokes = Typewriter.keystrokes("", target);
		expect(strokes.at(-1)?.content).toEqual(target);
	});
});

// ── animator over a running scene ────────────────────────────────────────

const textPerFrame = async (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	settings?: Parameters<typeof Scene.stream>[1],
): Promise<TextContent[]> => {
	const scene = Scene.make(make as never);
	const frames = await Effect.runPromise(
		Scene.stream(scene as never, settings).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
	);
	return [...frames].map((frame) => {
		const entry = Object.entries(frame.instances).find(
			([id]) => id !== frame.root,
		)![1];
		return (entry.data as { text: TextContent }).text;
	});
};

describe("Typewriter.typewriteTo", () => {
	it("reveals the text over frames and lands exactly on target", async () => {
		const perFrame = await textPerFrame(
			function* () {
				const label = yield* Scene.instantiate(Shapes.Text, { text: "" });
				yield* label.pipe(Typewriter.typewriteTo("Hi", { cps: 60 }));
			},
			{ frameRate: 60 },
		);
		// one frame per grapheme at 60 cps / 60 fps, plus the scene's trailing
		// final-state frame (every scene ends by re-emitting its last state)
		expect(perFrame).toEqual(["H", "Hi", "Hi"]);
		expect(perFrame.at(-1)).toBe("Hi");
	});

	it("holds each keystroke for the frames implied by cps", async () => {
		const perFrame = await textPerFrame(
			function* () {
				const label = yield* Scene.instantiate(Shapes.Text, { text: "" });
				yield* label.pipe(Typewriter.typewriteTo("Hi", { cps: 30 }));
			},
			{ frameRate: 60 },
		);
		// 60fps / 30cps = 2 frames per grapheme, plus the trailing final frame
		expect(perFrame).toEqual(["H", "H", "Hi", "Hi", "Hi"]);
	});

	it("adds no keystroke frames when the text is unchanged", async () => {
		const perFrame = await textPerFrame(function* () {
			const label = yield* Scene.instantiate(Shapes.Text, { text: "same" });
			yield* label.pipe(Typewriter.typewriteTo("same"));
		});
		// only the scene's baseline final-state frame — the animator ticks nothing
		expect(perFrame).toEqual(["same"]);
	});

	it("draws jitter from the seeded Random, so pacing is reproducible", async () => {
		const build = () =>
			textPerFrame(
				function* () {
					const label = yield* Scene.instantiate(Shapes.Text, { text: "" });
					yield* label.pipe(
						Typewriter.typewriteTo("hello", { cps: 20, jitter: 0.8 }),
					);
				},
				{ frameRate: 60, seed: "typewriter-test" },
			);
		const a = await build();
		const b = await build();
		expect(a).toEqual(b);
		// still lands exactly on target
		expect(a.at(-1)).toBe("hello");
	});
});

describe("Typewriter.typewrite", () => {
	it("starts from the explicit origin, not the instance's current text", async () => {
		const perFrame = await textPerFrame(
			function* () {
				const label = yield* Scene.instantiate(Shapes.Text, { text: "xyz" });
				yield* label.pipe(Typewriter.typewrite("ca", "cu", { cps: 60 }));
			},
			{ frameRate: 60 },
		);
		// origin forced to "ca": backspace 'a' -> "c", type 'u' -> "cu",
		// plus the scene's trailing final-state frame
		expect(perFrame).toEqual(["c", "cu", "cu"]);
	});
});
