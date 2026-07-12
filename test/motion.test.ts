import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Motion from "../src/Motion";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import type * as Timing from "../src/Timing";

// runs a scene and extracts a value from its first instance per frame
const runScene = async <A>(
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	extract: (data: Record<string, any>) => A,
): Promise<A[]> => {
	const scene = Scene.make(make as never);
	const frames = await Effect.runPromise(
		Scene.stream(scene as never).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
	);
	return [...frames].map((frame) => {
		// skip the root group — the first non-root instance is the subject
		const entry = Object.entries(frame.instances).find(
			([id]) => id !== frame.root,
		)![1];
		return extract(entry.data as Record<string, any>);
	});
};

const moveXScene = (timing?: Timing.TimingInput) =>
	runScene(
		function* () {
			const circle = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			yield* Motion.moveTo(
				circle,
				{ x: 100 },
				"1 second",
				timing as Timing.TimingInput,
			);
		},
		(data) => data.x as number,
	);

describe("timing on motion combinators", () => {
	it("easing changes pacing, not endpoints", async () => {
		const linear = await moveXScene();
		const eased = await moveXScene("easeInQuad");

		expect(linear).toHaveLength(eased.length);
		// midpoint: frame 29 is t = 30/60 = 0.5
		expect(linear[29]).toBeCloseTo(50, 6);
		expect(eased[29]).toBeCloseTo(25, 6);
		// identical exact final frame
		expect(linear[59]).toBe(100);
		expect(eased[59]).toBe(100);
	});

	it("easeOutBack overshoots then lands exactly", async () => {
		const track = await moveXScene("easeOutBack");
		expect(Math.max(...track)).toBeGreaterThan(100);
		expect(track[59]).toBeCloseTo(100, 10);
	});

	it("data-last form applies timing identically", async () => {
		const track = await runScene(
			function* () {
				const circle = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
				yield* circle.pipe(Motion.moveTo({ x: 100 }, "1 second", "easeInQuad"));
			},
			(data) => data.x as number,
		);
		expect(track[29]).toBeCloseTo(25, 6);
		expect(track[59]).toBe(100);
	});

	it("move with explicit start and timing", async () => {
		const track = await runScene(
			function* () {
				const circle = yield* Scene.instantiate(Shapes.Circle, { x: 500 });
				yield* Motion.move(
					circle,
					{ x: 0 },
					{ x: 100 },
					"1 second",
					"easeOutBounce",
				);
			},
			(data) => data.x as number,
		);
		// explicit start: first frame is near 0, not 500
		expect(track[0]!).toBeLessThan(50);
		expect(track[59]).toBeCloseTo(100, 10);
	});
});

describe("tween / tweenTo", () => {
	it("tween interpolates explicit records through fn", async () => {
		const received: number[] = [];
		await runScene(
			function* () {
				const circle = yield* Scene.instantiate(Shapes.Circle, {});
				yield* Motion.tween(
					{ v: 0 },
					{ v: 10 },
					"1 second",
					(value) =>
						Effect.sync(() => {
							received.push(value.v);
						}),
					"linear",
				);
				// keep the scene's shape valid for runScene's extractor
				yield* Scene.update(circle, (data) => data);
			},
			(data) => data.x as number,
		);
		expect(received).toHaveLength(60);
		expect(received[29]).toBeCloseTo(5, 6);
		expect(received[59]).toBe(10);
	});

	it("tweenTo reads the origin from the instance's current data", async () => {
		const received: number[] = [];
		await runScene(
			function* () {
				const circle = yield* Scene.instantiate(Shapes.Circle, { x: 100 });
				yield* circle.pipe(
					Motion.tweenTo({ x: 200 }, "1 second", (value) =>
						Effect.sync(() => {
							received.push(value.x as number);
						}),
					),
				);
			},
			(data) => data.x as number,
		);
		// interpolated from 100 without the caller specifying the origin
		expect(received[0]!).toBeGreaterThan(100);
		expect(received[0]!).toBeLessThan(105);
		expect(received[29]).toBeCloseTo(150, 6);
		expect(received[59]).toBe(200);
	});
});

describe("Scene.sleep", () => {
	it("holds the scene for the duration's frame count", async () => {
		const track = await runScene(
			function* () {
				const circle = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
				yield* Scene.sleep("500 millis"); // 30 frames at 60fps
				yield* Motion.moveTo(circle, { x: 100 }, "1 second");
			},
			(data) => data.x as number,
		);
		// 30 sleep frames + 60 move frames + 1 scene-completion settle frame
		expect(track).toHaveLength(91);
		expect(track[29]).toBe(0); // still asleep, unmoved
		expect(track[30]).toBeGreaterThan(0); // first move frame
		expect(track.at(-1)).toBe(100);
	});

	it("zero duration is a no-op", async () => {
		const track = await runScene(
			function* () {
				const circle = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
				yield* Scene.sleep("0 seconds");
				yield* Motion.moveTo(circle, { x: 100 }, "1 second");
			},
			(data) => data.x as number,
		);
		expect(track).toHaveLength(61); // 60 move + settle frame, none from sleep
	});
});
