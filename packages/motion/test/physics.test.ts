import { Effect, Exit } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Physics from "../src/Physics";
import type * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import * as S from "../src/schemas";
import { unreachable } from "./support/raise";

// runs resolve and returns the defect message it died with
const resolveDies = async (input: Physics.SpringInput): Promise<string> => {
	const exit = await Effect.runPromiseExit(Physics.resolve(input));
	expect(Exit.isFailure(exit)).toBe(true);
	return JSON.stringify(exit, (_key, value) =>
		value instanceof Error ? value.message : value,
	);
};

describe("resolve and validation", () => {
	it("resolves presets by name", async () => {
		expect(await Effect.runPromise(Physics.resolve("plop"))).toBe(
			Physics.springs.plop,
		);
	});

	it("passes custom spring objects through", async () => {
		const custom: Physics.Spring = { mass: 1, stiffness: 5, damping: 1 };
		expect(await Effect.runPromise(Physics.resolve(custom))).toBe(custom);
	});

	it("dies on unknown preset names", async () => {
		expect(await resolveDies("sproing" as Physics.SpringName)).toContain(
			"unknown spring",
		);
	});

	it("dies on invalid configurations", async () => {
		expect(
			await resolveDies({ mass: 0, stiffness: 10, damping: 0.5 }),
		).toContain("mass");
		expect(
			await resolveDies({ mass: 1, stiffness: -1, damping: 0.5 }),
		).toContain("stiffness");
		expect(
			await resolveDies({ mass: 1, stiffness: 10, damping: -0.5 }),
		).toContain("damping");
	});
});

const runScene = async <A>(
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	extract: (data: Record<string, any>) => A,
	settings: Partial<Runner.Settings> = {},
): Promise<A[]> => {
	const scene = Scene.make(make as never, { width: 500, height: 300 });
	const frames = await Effect.runPromise(
		Scene.stream(scene as never, settings).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
	);
	return [...frames].map((frame) => {
		// skip the root group — the first non-root instance is the subject
		const entry = Object.entries(frame.instances).find(
			([id]) => id !== frame.root,
		)?.[1];
		return extract(entry?.data as Record<string, any>);
	});
};

const springXScene = (
	spring: Physics.SpringInput,
	settleTolerance?: number,
	settings: Partial<Runner.Settings> = {},
) =>
	runScene(
		function* () {
			const circle = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			yield* Physics.springTo(
				circle,
				{ x: 100 },
				spring,
				settleTolerance as number,
			);
		},
		(data) => data.position.x as number,
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
				const circle = yield* Scene.instantiate("Circle", {
					position: S.vec3({ x: 0, y: 0 }),
				});
				yield* circle.pipe(Physics.springTo({ x: 100, y: 40 }, "swing"));
			},
			(data) => ({
				x: data.position.x as number,
				y: data.position.y as number,
			}),
		);
		const last = track.at(-1) ?? unreachable();
		expect(last).toEqual({ x: 100, y: 40 });
	});

	it("spring takes an explicit origin through the position lens", async () => {
		const track = await runScene(
			function* () {
				const circle = yield* Scene.instantiate("Circle", {
					position: S.vec3({ x: 500 }),
				});
				yield* Physics.spring(circle, { x: 0 }, { x: 100 }, "smooth");
			},
			(data) => data.position.x as number,
		);
		// starts from the explicit origin, not the current position
		expect(track[0] ?? unreachable()).toBeLessThan(120);
		expect(track.at(-1)).toBe(100);
	});

	it("springTo works data-first with the default spring", async () => {
		const track = await runScene(
			function* () {
				const circle = yield* Scene.instantiate("Circle", {
					position: S.vec3({ x: 50 }),
				});
				yield* Physics.springTo(circle, { x: 150 });
			},
			(data) => data.position.x as number,
		);
		expect(track.at(-1)).toBe(150);
		expect(track[0] ?? unreachable()).toBeGreaterThan(50);
	});
});

describe("frame-rate independence", () => {
	it("same spring at 30 and 60 fps follows the same trajectory in time", async () => {
		const at30 = await springXScene("smooth", undefined, { frameRate: 30 });
		const at60 = await springXScene("smooth", undefined, { frameRate: 60 });

		// position at ~0.5 s: frame 14 at 30 fps, frame 29 at 60 fps
		expect(at30[14] ?? unreachable()).toBeCloseTo(at60[29] ?? unreachable(), 6);
		// and at ~0.25 s
		expect(at30[6] ?? unreachable()).toBeCloseTo(at60[13] ?? unreachable(), 6);
		// both settle exactly
		expect(at30.at(-1)).toBe(100);
		expect(at60.at(-1)).toBe(100);
	});
});
