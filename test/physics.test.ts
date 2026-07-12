import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Physics from "../src/Physics";
import type * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";

describe("resolve and validation", () => {
	it("resolves presets by name", () => {
		expect(Physics.resolve("plop")).toBe(Physics.springs.plop);
	});

	it("passes custom spring objects through", () => {
		const custom: Physics.Spring = { mass: 1, stiffness: 5, damping: 1 };
		expect(Physics.resolve(custom)).toBe(custom);
	});

	it("throws on unknown preset names", () => {
		expect(() => Physics.resolve("sproing" as Physics.SpringName)).toThrow(
			/unknown spring/,
		);
	});

	it("rejects invalid configurations", () => {
		expect(() =>
			Physics.resolve({ mass: 0, stiffness: 10, damping: 0.5 }),
		).toThrow(/mass/);
		expect(() =>
			Physics.resolve({ mass: 1, stiffness: -1, damping: 0.5 }),
		).toThrow(/stiffness/);
		expect(() =>
			Physics.resolve({ mass: 1, stiffness: 10, damping: -0.5 }),
		).toThrow(/damping/);
	});
});

const runScene = async <A>(
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	extract: (data: Record<string, any>) => A,
	settings: Partial<Runner.Settings> = {},
): Promise<A[]> => {
	const scene = Scene.make(make as never);
	const frames = await Effect.runPromise(
		Scene.stream(scene as never, settings).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
	);
	return [...frames].map((frame) => {
		const entry = Object.values(frame.instances)[0]!;
		return extract(entry.data as Record<string, any>);
	});
};

const springXScene = (
	spring: Physics.SpringInput,
	settleTolerance?: number,
	settings: Partial<Runner.Settings> = {},
) =>
	runScene(
		function* () {
			const circle = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			yield* Physics.springTo(
				circle,
				{ x: 100 },
				spring,
				settleTolerance as number,
			);
		},
		(data) => data.x as number,
		settings,
	);

describe("spring physics", () => {
	it("settles exactly on the target", async () => {
		const track = await springXScene("smooth");
		expect(track.at(-1)).toBe(100);
	});

	it("bouncy presets overshoot then land exactly", async () => {
		const track = await springXScene("bounce");
		expect(Math.max(...track)).toBeGreaterThan(100);
		expect(track.at(-1)).toBe(100);
	});

	it("duration emerges from physics: different springs, different lengths", async () => {
		const stiff = await springXScene("strike");
		const loose = await springXScene("bounce");
		expect(stiff.length).not.toBe(loose.length);
	});

	it("custom settle tolerance changes the settle frame", async () => {
		const precise = await springXScene("smooth", 0.0001);
		const sloppy = await springXScene("smooth", 1);
		expect(sloppy.length).toBeLessThan(precise.length);
	});

	it("record keys settle together", async () => {
		const track = await runScene(
			function* () {
				const circle = yield* Scene.instantiate(Shapes.Circle, {
					x: 0,
					y: 0,
				});
				yield* circle.pipe(Physics.springTo({ x: 100, y: 40 }, "swing"));
			},
			(data) => ({ x: data.x as number, y: data.y as number }),
		);
		const last = track.at(-1)!;
		expect(last).toEqual({ x: 100, y: 40 });
	});

	it("spring drives a callback from an explicit origin", async () => {
		const received: number[] = [];
		await runScene(
			function* () {
				yield* Scene.instantiate(Shapes.Circle, {});
				yield* Physics.spring({ v: 0 }, { v: 1 }, "smooth", (value) =>
					Effect.sync(() => {
						received.push(value.v);
					}),
				);
			},
			(data) => data.x as number,
		);
		expect(received.length).toBeGreaterThan(2);
		expect(received.at(-1)).toBe(1);
	});

	it("springTo works data-first with the default spring", async () => {
		const track = await runScene(
			function* () {
				const circle = yield* Scene.instantiate(Shapes.Circle, { x: 50 });
				yield* Physics.springTo(circle, { x: 150 });
			},
			(data) => data.x as number,
		);
		expect(track.at(-1)).toBe(150);
		expect(track[0]!).toBeGreaterThan(50);
	});
});

describe("frame-rate independence", () => {
	it("same spring at 30 and 60 fps follows the same trajectory in time", async () => {
		const at30 = await springXScene("smooth", undefined, { frameRate: 30 });
		const at60 = await springXScene("smooth", undefined, { frameRate: 60 });

		// position at ~0.5 s: frame 14 at 30 fps, frame 29 at 60 fps
		expect(at30[14]!).toBeCloseTo(at60[29]!, 6);
		// and at ~0.25 s
		expect(at30[6]!).toBeCloseTo(at60[13]!, 6);
		// both settle exactly
		expect(at30.at(-1)).toBe(100);
		expect(at60.at(-1)).toBe(100);
	});
});
