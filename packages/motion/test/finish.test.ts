import { Effect, Schedule } from "effect";
import * as Fiber from "effect/Fiber";
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

describe("Scene.finish", () => {
	it("releases awaiters immediately while the tail keeps playing", async () => {
		const frames = await collectFrames(function* () {
			const a = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			const b = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			const handle = yield* Scene.fork(
				Effect.gen(function* () {
					yield* Motion.tween(b, { x: 0 }, { x: 50 }, "0.5 seconds");
					yield* Scene.finish;
					// tail: 30 more frames, nobody waits for these
					yield* Motion.tween(b, { x: 50 }, { x: 100 }, "0.5 seconds");
				}) as never,
			);
			yield* handle.finished; // resolves at finish, not at completion
			yield* Motion.tween(a, { x: 0 }, { x: 100 }, "0.5 seconds");
		});
		// awaiters resume at the first frame boundary AFTER finish (frame
		// 31): a runs 31..60, concurrently with b's tail
		expect(frames).toHaveLength(62);
		expect(frames[35]?.[0]?.x).toBeGreaterThan(0); // a moving…
		expect(frames[35]?.[1]?.x).toBeGreaterThan(50); // …while b's tail moves
		expect(frames.at(-1)?.[1]?.x).toBe(100); // tail completed naturally
	});

	it("a finished fork stops blocking scene end; its tail is cut like a background", async () => {
		const frames = await collectFrames(function* () {
			const a = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			const b = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			yield* Scene.fork(
				Effect.gen(function* () {
					yield* Motion.tween(b, { x: 0 }, { x: 50 }, "0.5 seconds");
					yield* Scene.finish;
					yield* Motion.tweenTo(b, { x: 500 }, "10 seconds"); // long tail
				}) as never,
			);
			yield* Motion.tween(a, { x: 0 }, { x: 100 }, "1 second");
		});
		// bounded by the 60-frame body, not the 600-frame tail
		expect(frames).toHaveLength(61);
		const lastB = frames.at(-1)?.[1]?.x;
		expect(lastB).toBeGreaterThan(50); // the tail did animate…
		expect(lastB).toBeLessThan(100); // …but was interrupted early
	});

	it("finish with other awaited forks pending keeps the scene alive", async () => {
		const frames = await collectFrames(function* () {
			const b = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			const c = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			yield* Scene.fork(
				Effect.gen(function* () {
					yield* Motion.tween(b, { x: 0 }, { x: 50 }, "0.5 seconds");
					yield* Scene.finish;
					yield* Motion.tweenTo(b, { x: 500 }, "10 seconds");
				}) as never,
			);
			// un-finished fork: holds the scene open for 90 frames
			yield* Scene.fork(Motion.tween(c, { x: 0 }, { x: 100 }, "1.5 seconds"));
		});
		expect(frames).toHaveLength(91);
		// the finished fork's tail animated through the drain
		expect(frames[80]?.[1]?.x).toBeGreaterThan(frames[40]?.[1]?.x);
	});

	it("finish is idempotent; finish-then-complete decrements once", async () => {
		const frames = await collectFrames(function* () {
			const c = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			yield* Scene.fork(
				Effect.gen(function* () {
					yield* Scene.finish;
					yield* Scene.finish;
					yield* Scene.tick;
					// completes here: implicit finish must not decrement again
				}) as never,
			);
			// double-decrement would end the scene long before this fork
			yield* Scene.fork(Motion.tween(c, { x: 0 }, { x: 100 }, "0.5 seconds"));
		});
		expect(frames).toHaveLength(31);
		expect(frames.at(-1)?.[0]?.x).toBe(100);
	});

	it("completion implies finish", async () => {
		const frames = await collectFrames(function* () {
			const a = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			const b = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			const handle = yield* Scene.fork(
				Motion.tween(b, { x: 0 }, { x: 100 }, "0.5 seconds"),
			);
			yield* handle.finished; // no explicit finish: opens at completion
			yield* Motion.tween(a, { x: 0 }, { x: 100 }, "166 millis");
		});
		expect(frames).toHaveLength(42); // 30 + 1 wake frame + 10 + settle
		expect(frames[29]?.[0]?.x).toBe(0); // a waited for b's completion
	});

	it("root finish ends an otherwise-infinite body", async () => {
		const frames = await collectFrames(function* () {
			const c = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			yield* Motion.tween(c, { x: 0 }, { x: 100 }, "0.5 seconds");
			yield* Scene.finish;
			// would run forever; the consumer cuts it at the semantic end
			yield* Scene.repeat(
				Motion.tween(c, { x: 0 }, { x: 100 }, "100 millis") as never,
				Schedule.forever,
			);
		});
		expect(frames.length).toBeLessThanOrEqual(31);
		expect(frames.length).toBeGreaterThanOrEqual(30);
	});

	it("a parent bounds a tail by interrupting the handle's fiber", async () => {
		const frames = await collectFrames(function* () {
			const a = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			const b = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			const handle = yield* Scene.fork(
				Effect.gen(function* () {
					yield* Motion.tween(b, { x: 0 }, { x: 50 }, "0.5 seconds");
					yield* Scene.finish;
					yield* Motion.tweenTo(b, { x: 500 }, "10 seconds");
				}) as never,
			);
			yield* handle.finished;
			yield* Scene.sleep("166 millis"); // let the tail run 10 frames
			yield* Fiber.interrupt(handle.fiber);
			yield* Motion.tween(a, { x: 0 }, { x: 100 }, "0.5 seconds");
		});
		expect(frames).toHaveLength(72); // 30 + 1 wake + 10 + 30 + settle
		// b frozen after the interrupt at frame 41
		expect(frames[55]?.[1]?.x).toBe(frames[42]?.[1]?.x);
	});
});
