import { Effect, Schedule } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Motion from "../src/Motion";
import * as Scene from "../src/Scene";
import * as S from "../src/schemas";
import { whileInputBelow } from "./support/schedule";

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
	it("runs effects in lockstep parallel", async () => {
		const frames = await collectFrames(function* () {
			const a = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			const b = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			yield* Scene.all([
				Motion.move(a, { x: 0 }, { x: 100 }, "0.5 seconds"),
				Motion.move(b, { x: 0 }, { x: 100 }, "0.5 seconds"),
			]);
		});
		expect(frames).toHaveLength(31);
		expect(frames.at(-1)?.[0]?.position.x).toBe(100);
		expect(frames.at(-1)?.[1]?.position.x).toBe(100);
		// truly concurrent: both mid-flight on the same frame
		expect(frames[15]?.[0]?.position.x).toBeGreaterThan(0);
		expect(frames[15]?.[1]?.position.x).toBeGreaterThan(0);
	});
});

describe("Scene.chain", () => {
	it("items run one at a time with schedule-paced rests — never overlapping", async () => {
		const frames = await collectFrames(function* () {
			const a = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			const b = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			yield* Scene.chain(
				[
					Motion.move(a, { x: 0 }, { x: 100 }, "0.5 seconds"),
					Motion.move(b, { x: 0 }, { x: 100 }, "0.5 seconds"),
				],
				Schedule.spaced("0.5 seconds"),
			);
		});
		// item 1: 0..29 — rest: 30..59 — item 2: 60..89 — settle: 90
		expect(frames).toHaveLength(91);
		expect(frames[29]?.[0]?.position.x).toBe(100);
		expect(frames[59]?.[1]?.position.x).toBe(0); // b untouched through the rest
		expect(frames[60]?.[1]?.position.x).toBeGreaterThan(0); // b starts at frame 60
		expect(frames.at(-1)?.[1]?.position.x).toBe(100);
	});

	it("without a schedule, plain sequential composition", async () => {
		const frames = await collectFrames(function* () {
			const a = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			const b = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			yield* Scene.chain([
				Motion.move(a, { x: 0 }, { x: 100 }, "0.5 seconds"),
				Motion.move(b, { x: 0 }, { x: 100 }, "0.5 seconds"),
			]);
		});
		expect(frames).toHaveLength(61);
		expect(frames[29]?.[1]?.position.x).toBe(0);
		expect(frames[30]?.[1]?.position.x).toBeGreaterThan(0); // b right after a, no gap
	});

	it("schedule exhaustion skips remaining items, observably", async () => {
		let completed = 0;
		const spawn = () =>
			Effect.gen(function* () {
				const c = yield* Scene.instantiate("Circle", {
					position: S.vec3({ x: 0 }),
				});
				yield* Motion.move(c, { x: 0 }, { x: 100 }, "166 millis");
			}) as never;
		const frames = await collectFrames(function* () {
			const result = yield* Scene.chain(
				[spawn(), spawn(), spawn(), spawn(), spawn()],
				Schedule.spaced("50 millis").pipe(Schedule.upTo({ times: 2 })),
			);
			completed = result.completed;
		});
		expect(completed).toBe(3);
		expect(frames.at(-1)).toHaveLength(3); // items 4 and 5 never ran
	});

	it("item results feed the schedule as input", async () => {
		let n = 0;
		const item = () =>
			Effect.gen(function* () {
				yield* Scene.tick;
				return ++n;
			}) as never;
		let completed = 0;
		await collectFrames(function* () {
			yield* Scene.instantiate("Circle", { position: S.vec3({ x: 0 }) });
			const result = yield* Scene.chain(
				[item(), item(), item(), item(), item()],
				whileInputBelow(3),
			);
			completed = result.completed;
		});
		// stops advancing after the first item whose result is >= 3
		expect(n).toBe(3);
		expect(completed).toBe(3);
	});
});

describe("Scene.stagger", () => {
	it("staggers starts on exact frames; pacing never delays completion", async () => {
		const frames = await collectFrames(function* () {
			const a = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			const b = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			const c = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			yield* Scene.stagger(
				[
					Motion.move(a, { x: 0 }, { x: 100 }, "0.5 seconds"),
					Motion.move(b, { x: 0 }, { x: 100 }, "0.5 seconds"),
					Motion.move(c, { x: 0 }, { x: 100 }, "0.5 seconds"),
				],
				Schedule.spaced("0.25 seconds"),
			);
		});
		// releases at frames 0, 15, 30 — last branch ends at 60, settle at 61.
		// The schedule itself is infinite: it must not add a tail.
		expect(frames).toHaveLength(61);
		expect(frames[14]?.[1]?.position.x).toBe(0); // b not yet released
		expect(frames[15]?.[1]?.position.x).toBeGreaterThan(0); // b starts at frame 15
		expect(frames[29]?.[2]?.position.x).toBe(0);
		expect(frames[30]?.[2]?.position.x).toBeGreaterThan(0); // c starts at frame 30
		// overlap: a and b animate concurrently
		expect(frames[20]?.[0]?.position.x).toBeGreaterThan(0);
		expect(frames[20]?.[0]?.position.x).toBeLessThan(100);
		expect(frames[20]?.[1]?.position.x).toBeGreaterThan(0);
		expect(frames[20]?.[1]?.position.x).toBeLessThan(100);
		expect(frames.at(-1)?.every((d) => d.position.x === 100)).toBe(true);
	});

	it("schedule exhaustion skips the remaining effects, observably", async () => {
		let released = 0;
		const spawn = () =>
			Effect.gen(function* () {
				const c = yield* Scene.instantiate("Circle", {
					position: S.vec3({ x: 0 }),
				});
				yield* Motion.move(c, { x: 0 }, { x: 100 }, "166 millis");
			}) as never;
		const frames = await collectFrames(function* () {
			const result = yield* Scene.stagger(
				[spawn(), spawn(), spawn(), spawn(), spawn()],
				Schedule.spaced("50 millis").pipe(Schedule.upTo({ times: 2 })),
			);
			released = result.released;
		});
		// releases at frames 0, 3, 6; effects 4 and 5 never run
		expect(released).toBe(3);
		expect(frames.at(-1)).toHaveLength(3);
		// last release at 6 + 10 animation frames = 16, settle at 17
		expect(frames).toHaveLength(17);
	});
});
