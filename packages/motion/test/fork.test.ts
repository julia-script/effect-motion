import { Effect, Schedule } from "effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as S from "../src/Entity";
import * as Motion from "../src/Motion";
import * as Scene from "../src/Scene";
import { unreachable } from "./support/raise";

// runs a scene and returns, per frame, the non-root instances' data in
// instantiation order
const collectFrames = async (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
): Promise<Array<Array<Record<string, any>>>> => {
	const scene = Scene.make(make as never, { width: 500, height: 300 });
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

describe("Scene.fork", () => {
	it("a scene containing only a fork still plays to completion", async () => {
		const frames = await collectFrames(function* () {
			const circle = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			yield* Scene.fork(
				Motion.move(circle, { x: 0 }, { x: 100 }, "0.5 seconds"),
			);
			// body returns immediately — the fork must keep the scene alive
		});
		// 30 animation frames + the scene-completion settle frame
		expect(frames).toHaveLength(31);
		expect(frames.at(-1)?.[0]?.position.x).toBe(100);
	});

	it("body ends first: frames keep flowing while the fork drains", async () => {
		const frames = await collectFrames(function* () {
			const a = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			const b = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			yield* Scene.fork(Motion.move(b, { x: 0 }, { x: 100 }, "1 second"));
			yield* Motion.move(a, { x: 0 }, { x: 100 }, "0.5 seconds");
			// body over at frame 30; the fork animates until frame 60
		});
		expect(frames).toHaveLength(61);
		const last = frames.at(-1) ?? unreachable();
		expect(last[0]?.position.x).toBe(100);
		expect(last[1]?.position.x).toBe(100);
		// after the body ended, the fork still progressed frame by frame
		expect(frames[35]?.[1]?.position.x).toBeGreaterThan(
			frames[30]?.[1]?.position.x,
		);
	});

	it("overlapping spawns via repeat drain naturally", async () => {
		const frames = await collectFrames(function* () {
			yield* Scene.repeat(
				Scene.fork(
					Effect.gen(function* () {
						const c = yield* Scene.instantiate("Circle", {
							position: S.vec3({ x: 0 }),
						});
						yield* Motion.move(c, { x: 0 }, { x: 100 }, "333 millis");
					}) as never,
				),
				Schedule.spaced("50 millis").pipe(Schedule.upTo({ times: 2 })),
			);
			// spawns at frames 0, 3, 6 — each particle lives 20 frames
		});
		// last particle ends at frame 26, plus the settle frame
		expect(frames).toHaveLength(27);
		const last = frames.at(-1) ?? unreachable();
		expect(last).toHaveLength(3);
		for (const data of last) {
			expect(data.position.x).toBe(100);
		}
	});

	it("a failing fork fails the scene at drain", async () => {
		const attempt = collectFrames(function* () {
			yield* Scene.instantiate("Circle", { position: S.vec3({ x: 0 }) });
			yield* Scene.fork(
				Effect.gen(function* () {
					yield* Scene.tick;
					yield* Effect.fail(new Error("fork boom"));
				}) as never,
			);
			yield* Scene.sleep("50 millis");
		});
		await expect(attempt).rejects.toThrow("fork boom");
	});

	it("a manually interrupted fork releases its slot; the scene ends without it", async () => {
		const frames = await collectFrames(function* () {
			const circle = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			const handle = yield* Scene.fork(
				Motion.move(circle, { x: 0 }, { x: 100 }, "10 seconds"),
			);
			yield* Scene.sleep("83 millis"); // 5 frames
			yield* Fiber.interrupt(handle.fiber);
		});
		// 5 body frames + settle — the 600-frame fork is gone, no hang
		expect(frames).toHaveLength(6);
		expect(frames.at(-1)?.[0]?.position.x).toBeLessThan(2);
	});
});

describe("Scene.background", () => {
	it("is interrupted at scene end and never delays it", async () => {
		const frames = await collectFrames(function* () {
			const a = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			const b = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			yield* Scene.background(
				Motion.move(b, { x: 0 }, { x: 100 }, "10 seconds"),
			);
			yield* Motion.move(a, { x: 0 }, { x: 100 }, "0.5 seconds");
		});
		// bounded by the 30-frame body, not the 600-frame background
		expect(frames).toHaveLength(31);
		const last = frames.at(-1) ?? unreachable();
		expect(last[0]?.position.x).toBe(100);
		// the background animated while the body ran, mid-frame interrupt is safe
		expect(last[1]?.position.x).toBeGreaterThan(0);
		expect(last[1]?.position.x).toBeLessThan(10);
	});

	it("an indefinite background repeat is bounded by the scene", async () => {
		const frames = await collectFrames(function* () {
			const a = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			const b = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0, y: 0 }),
			});
			yield* Scene.background(
				Scene.repeat(
					Motion.move(b, { y: 0 }, { y: 50 }, "100 millis") as never,
					Schedule.forever,
				) as never,
			);
			yield* Motion.move(a, { x: 0 }, { x: 100 }, "0.5 seconds");
		});
		expect(frames).toHaveLength(31);
		// the bounce was live for the whole scene
		expect(frames[29]?.[1]?.position.y).toBeGreaterThan(0);
	});

	// A background is not content: it cannot define a scene's length, so a
	// body that spawns only backgrounds has nothing to wait for and must end
	// rather than block. These pin the startup window where the consumer asks
	// for the first frame before the forked body has run.
	it("a scene containing only a background terminates", {
		timeout: 5000,
	}, async () => {
		const frames = await collectFrames(function* () {
			const b = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			yield* Scene.background(
				Motion.move(b, { x: 0 }, { x: 100 }, "10 seconds"),
			);
		});
		// nothing holds the scene open, so it ends before producing a frame
		expect(frames).toHaveLength(0);
	});

	it("an endless background alone does not keep the scene alive", {
		timeout: 5000,
	}, async () => {
		const frames = await collectFrames(function* () {
			const b = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0, y: 0 }),
			});
			yield* Scene.background(
				Scene.repeat(
					Motion.move(b, { y: 0 }, { y: 50 }, "100 millis") as never,
					Schedule.forever,
				) as never,
			);
		});
		// ends immediately rather than running to the maxFrames cap
		expect(frames).toHaveLength(0);
	});

	it("backgrounds live through the fork drain, then stop", async () => {
		const frames = await collectFrames(function* () {
			const a = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			const b = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			yield* Scene.background(
				Motion.move(b, { x: 0 }, { x: 100 }, "10 seconds"),
			);
			yield* Scene.fork(Motion.move(a, { x: 0 }, { x: 100 }, "1 second"));
			yield* Scene.sleep("100 millis");
			// body ends at frame 6; the fork drains until frame 60
		});
		expect(frames).toHaveLength(61);
		// the background kept animating during the drain (past the body's end)
		expect(frames[59]?.[1]?.position.x).toBeGreaterThan(
			frames[6]?.[1]?.position.x,
		);
	});
});
