import { Effect } from "effect";
import * as Random from "effect/Random";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Motion from "../src/Motion";
import * as Phaser from "../src/Phaser";
import type * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";

const collectX = async (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	settings: Partial<Runner.Settings> = {},
): Promise<number[]> => {
	const scene = Scene.make(make as never);
	const frames = await Effect.runPromise(
		Scene.stream(scene as never, settings).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
	);
	return [...frames].map((frame) => {
		const entry = Object.entries(frame.instances).find(
			([id]) => id !== frame.root,
		)?.[1];
		if (entry === undefined) {
			throw new Error("frame has no non-root instance");
		}
		return (entry.data as { x: number }).x;
	});
};

const randomWalk = function* () {
	const circle = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
	for (let i = 0; i < 3; i++) {
		const target = yield* Random.nextBetween(0, 100);
		yield* Motion.tweenTo(circle, { x: target }, "100 millis");
	}
};

describe("deterministic scenes", () => {
	it("effect combinators work with zero layer plumbing", async () => {
		const track = await collectX(function* () {
			const circle = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			const x = yield* Random.nextBetween(10, 50);
			const bump = yield* Random.choice([1, 2, 3] as const);
			yield* Scene.update(circle, (data) => ({ ...data, x: x + bump }));
			yield* Scene.tick;
		});
		expect(track[0]).toBeGreaterThanOrEqual(11);
		expect(track[0]).toBeLessThanOrEqual(53);
	});

	it("same settings, byte-identical frames", async () => {
		const first = await collectX(randomWalk);
		const second = await collectX(randomWalk);
		expect(second).toEqual(first);
	});

	it("different seeds differ; default seed is deterministic", async () => {
		const seeded = await collectX(randomWalk, { seed: "another-seed" });
		const defaulted = await collectX(randomWalk);
		expect(seeded).not.toEqual(defaulted);

		const defaultedAgain = await collectX(randomWalk);
		expect(defaultedAgain).toEqual(defaulted);
	});
});

describe("parallel lanes stay reproducible", () => {
	const parallelScene = function* () {
		const a = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
		const b = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
		yield* Phaser.all([
			Effect.gen(function* () {
				const target = yield* Random.nextBetween(0, 100);
				yield* Motion.tweenTo(a, { x: target }, "100 millis");
			}),
			Effect.gen(function* () {
				const target = yield* Random.nextBetween(100, 200);
				yield* Motion.tweenTo(b, { x: target }, "100 millis");
			}),
		]);
	};

	const collectAll = async () => {
		const scene = Scene.make(parallelScene as never);
		const frames = await Effect.runPromise(
			Scene.stream(scene as never).pipe(
				Stream.runCollect,
			) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
		);
		return [...frames].map((frame) =>
			Object.entries(frame.instances)
				.filter(([id]) => id !== frame.root)
				.map(([, entry]) => (entry.data as { x: number }).x),
		);
	};

	it("two runs of a Phaser.all scene consuming randomness are identical", async () => {
		const first = await collectAll();
		const second = await collectAll();
		expect(second).toEqual(first);
	});
});
