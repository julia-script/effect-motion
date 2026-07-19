import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Motion from "../src/Motion";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/Shapes";

// runs a scene and extracts a value from its first instance per frame
const runScene = async <A>(
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	extract: (data: Record<string, any>) => A,
): Promise<A[]> => {
	const scene = Scene.make(make as never, { width: 500, height: 300 });
	const frames = await Effect.runPromise(
		Scene.stream(scene as never).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
	);
	return [...frames].map((frame) => {
		const entry = Object.entries(frame.instances).find(
			([id]) => id !== frame.root,
		)?.[1];
		return extract(entry?.data as Record<string, any>);
	});
};

describe("Motion.drive", () => {
	it("coordinated two-field motion from one eased parameter", async () => {
		// quarter circle: x = 100·cos, y = 100·sin — coupled fields no
		// per-field tween can express
		const track = await runScene(
			function* () {
				const c = yield* Scene.instantiate(Shapes.Circle, { x: 100, y: 0 });
				yield* Motion.drive(c, "1 second", "linear", (t, d) => ({
					...d,
					x: 100 * Math.cos((t * Math.PI) / 2),
					y: 100 * Math.sin((t * Math.PI) / 2),
				}));
			},
			(d) => [d.x as number, d.y as number] as const,
		);
		// radius preserved every frame — the coupling a chord-tween breaks
		for (const [x, y] of track) {
			expect(Math.hypot(x, y)).toBeCloseTo(100, 8);
		}
	});

	it("lands exactly at t = 1 under easing", async () => {
		const track = await runScene(
			function* () {
				const c = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
				yield* Motion.drive(c, "1 second", "easeInOutCubic", (t, d) => ({
					...d,
					x: t * 100,
				}));
			},
			(d) => d.x as number,
		);
		expect(track[59]).toBe(100); // exactly t = 1, not close-to
	});

	it("zero duration still takes one frame", async () => {
		const track = await runScene(
			function* () {
				const c = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
				yield* Motion.drive(c, "0 seconds", "linear", (t, d) => ({
					...d,
					x: t * 42,
				}));
			},
			(d) => d.x as number,
		);
		// one drive frame (t = 1 immediately), plus the scene-end frame
		expect(track[0]).toBe(42);
		expect(track.every((x) => x === 42)).toBe(true);
	});

	it("pipeable form behaves identically", async () => {
		const piped = await runScene(
			function* () {
				const c = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
				yield* c.pipe(
					Motion.drive("500 millis", "linear", (t, d) => ({
						...d,
						x: t * 10,
					})),
				);
			},
			(d) => d.x as number,
		);
		// 30 drive frames (500ms at 60fps) + the scene-end frame
		expect(piped[0]).toBeCloseTo(10 / 30, 10);
		expect(piped[29]).toBe(10);
	});
});
