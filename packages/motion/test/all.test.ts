import { Effect, Schedule } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Motion from "../src/Motion";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";

// runs a scene and returns, per frame, the non-root instances' data in
// instantiation order
const collectFrames = async (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
): Promise<Array<Array<Record<string, any>>>> => {
	const scene = Scene.make(make as never);
	const frames = await Effect.runPromise(
		Scene.stream(scene as never).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
	);
	return [...frames].map((frame) =>
		Object.entries(frame.instances)
			.filter(([id]) => id !== frame.root)
			.map(([, entry]) => entry.data as Record<string, any>),
	);
};

describe("Scene.all", () => {
	it("plain form runs effects in lockstep parallel", async () => {
		let released = 0;
		const frames = await collectFrames(function* () {
			const a = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			const b = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			const result = yield* Scene.all([
				Motion.tween(a, { x: 0 }, { x: 100 }, "0.5 seconds"),
				Motion.tween(b, { x: 0 }, { x: 100 }, "0.5 seconds"),
			]);
			released = result.released;
		});
		expect(frames).toHaveLength(31);
		expect(frames.at(-1)![0]!.x).toBe(100);
		expect(frames.at(-1)![1]!.x).toBe(100);
		// truly concurrent: both mid-flight on the same frame
		expect(frames[15]![0]!.x).toBeGreaterThan(0);
		expect(frames[15]![1]!.x).toBeGreaterThan(0);
		expect(released).toBe(2);
	});

	it("schedule staggers starts on exact frames; pacing never delays completion", async () => {
		const frames = await collectFrames(function* () {
			const a = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			const b = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			const c = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			yield* Scene.all(
				[
					Motion.tween(a, { x: 0 }, { x: 100 }, "0.5 seconds"),
					Motion.tween(b, { x: 0 }, { x: 100 }, "0.5 seconds"),
					Motion.tween(c, { x: 0 }, { x: 100 }, "0.5 seconds"),
				],
				{ schedule: Schedule.spaced("0.25 seconds") },
			);
		});
		// releases at frames 0, 15, 30 — last branch ends at 60, settle at 61.
		// The schedule itself is infinite: it must not add a tail.
		expect(frames).toHaveLength(61);
		expect(frames[14]![1]!.x).toBe(0); // b not yet released
		expect(frames[15]![1]!.x).toBeGreaterThan(0); // b starts at frame 15
		expect(frames[29]![2]!.x).toBe(0);
		expect(frames[30]![2]!.x).toBeGreaterThan(0); // c starts at frame 30
		// overlap: a and b animate concurrently
		expect(frames[20]![0]!.x).toBeGreaterThan(0);
		expect(frames[20]![0]!.x).toBeLessThan(100);
		expect(frames[20]![1]!.x).toBeGreaterThan(0);
		expect(frames[20]![1]!.x).toBeLessThan(100);
		expect(frames.at(-1)!.every((d) => d.x === 100)).toBe(true);
	});

	it("schedule exhaustion skips the remaining effects, observably", async () => {
		let released = 0;
		const spawn = () =>
			Effect.gen(function* () {
				const c = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
				yield* Motion.tween(c, { x: 0 }, { x: 100 }, "166 millis");
			}) as never;
		const frames = await collectFrames(function* () {
			const result = yield* Scene.all(
				[spawn(), spawn(), spawn(), spawn(), spawn()],
				{
					schedule: Schedule.both(
						Schedule.spaced("50 millis"),
						Schedule.recurs(2),
					),
				},
			);
			released = result.released;
		});
		// releases at frames 0, 3, 6; effects 4 and 5 never run
		expect(released).toBe(3);
		expect(frames.at(-1)!).toHaveLength(3);
		// last release at 6 + 10 animation frames = 16, settle at 17
		expect(frames).toHaveLength(17);
	});
});
