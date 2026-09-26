import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { Color, Motion, Entity as S, Scene } from "effect-motion";
import { describe, expect, it } from "vitest";
import * as Frames from "../src/Frames";

// at 30fps a 1-second move is 30 ticks → 31 frames (0–30)
const settings = { frameRate: 30 } as const;
const scene = Scene.make(
	function* () {
		const dot = yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 0, y: 0 }),
			radius: 10,
			fillColor: Color.hex("#fff"),
		});
		yield* dot.pipe(Motion.moveTo({ x: 300 }, "1 second"));
	},
	{ width: 200, height: 120 },
);
const infinite = Scene.make(
	function* () {
		yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 0, y: 0 }),
			radius: 5,
			fillColor: Color.hex("#fff"),
		});
		while (true) yield* Scene.tick;
	},
	{ width: 200, height: 120 },
);

const frameIndices = (selection: string, s = scene, st = {}) =>
	Effect.runPromise(
		Frames.sample(s, selection, { ...settings, ...st }).pipe(
			Effect.map((samples) => samples.map((x) => x.frame)),
		),
	);
const failure = (selection: string, s = scene, st = {}) =>
	Effect.runPromise(
		Effect.flip(Frames.sample(s, selection, { ...settings, ...st })),
	);

describe("parse", () => {
	it("parses every selector form", async () => {
		const sel = await Effect.runPromise(
			Frames.parse("0, 30,1.5s,500ms,50%,end"),
		);
		expect(sel).toEqual({
			_tag: "At",
			selectors: [
				{ _tag: "Frame", frame: 0 },
				{ _tag: "Frame", frame: 30 },
				{ _tag: "Time", seconds: 1.5 },
				{ _tag: "Time", seconds: 0.5 },
				{ _tag: "Percent", percent: 50 },
				{ _tag: "End" },
			],
		});
		expect(await Effect.runPromise(Frames.parse("count 9"))).toEqual({
			_tag: "Count",
			count: 9,
		});
	});

	it.each([
		"abc",
		"1.5",
		"-1",
		"120%",
		"0,,1",
		"",
		"count 0",
	])("rejects %j naming the value", async (input) => {
		const error = await Effect.runPromise(Effect.flip(Frames.parse(input)));
		expect(error).toBeInstanceOf(Frames.FrameSelectionError);
		expect(error.message).toContain(input.trim() === "" ? "empty" : input);
	});
});

describe("sample", () => {
	it("resolves indices, times, percentages and end", async () => {
		expect(await frameIndices("0,15,500ms,1s,50%,end")).toEqual([
			0, 15, 15, 30, 15, 30,
		]);
	});

	it("count N spaces frames evenly, including first and last", async () => {
		expect(await frameIndices("count 3")).toEqual([0, 15, 30]);
		expect(await frameIndices("count 1")).toEqual([0]);
	});

	it("carries each frame's time and state", async () => {
		const [first, last] = await Effect.runPromise(
			Frames.sample(scene, "0,end", settings),
		);
		expect(first?.time).toBe(0);
		expect(last?.time).toBe(1);
		const x = (f: typeof first) =>
			Object.values(f?.data.instances ?? {}).flatMap((e) =>
				e.data._tag === "Circle" ? [e.data.position.x] : [],
			);
		// frame 0 is the first advanced frame: one 10px step into the move
		expect(x(first)).toEqual([10]);
		expect(x(last)).toEqual([300]);
	});

	it("fails on an out-of-range frame, naming it and the scene length", async () => {
		const error = await failure("0,2s");
		expect(error.message).toContain("Frame 60 (2s)");
		expect(error.message).toContain("31 frames");
		expect((await failure("31")).message).toContain("Frame 31 is out of range");
	});

	it("samples an infinite scene by index, but refuses to find its end", async () => {
		const inf = { maxFrames: Number.POSITIVE_INFINITY };
		expect(await frameIndices("0,100", infinite, inf)).toEqual([0, 100]);
		for (const sel of ["end", "50%", "count 3"]) {
			expect((await failure(sel, infinite, inf)).message).toContain("infinite");
		}
	});
});

describe("toJson", () => {
	it("is plain JSON and deterministic across runs", async () => {
		const run = () =>
			Effect.runPromise(
				Frames.sample(scene, "count 4", settings).pipe(
					Effect.map((s) => JSON.stringify(Frames.toJson(s))),
				),
			);
		const json = await run();
		expect(json).toBe(await run());
		const [state] = JSON.parse(json);
		expect(state).toMatchObject({
			frame: 0,
			time: 0,
			width: 200,
			height: 120,
			frameRate: 30,
		});
		expect(Object.keys(state.instances).length).toBeGreaterThan(0);
		expect(state.camera).toBeDefined();
	});
});

it("never imports the GPU renderer", () => {
	const source = readFileSync(
		new URL("../src/Frames.ts", import.meta.url),
		"utf8",
	);
	expect(source).not.toMatch(/from "@effect-motion\/(renderer|three)/);
});
