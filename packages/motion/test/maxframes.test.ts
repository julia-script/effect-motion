import { Effect, Schedule } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Motion from "../src/Motion";
import type * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";

const infiniteScene = () =>
	Scene.make(function* () {
		const circle = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
		yield* Scene.repeat(
			Motion.tween(circle, { x: 0 }, { x: 100 }, "100 millis") as never,
			Schedule.forever,
		);
	} as never);

const collect = (
	scene: ReturnType<typeof infiniteScene>,
	settings: Partial<Runner.Settings>,
	take?: number,
) =>
	Effect.runPromise(
		Scene.stream(scene as never, settings).pipe(
			take === undefined ? (s) => s : Stream.take(take),
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<unknown>, never, never>,
	);

describe("maxFrames", () => {
	it("an infinite scene dies at the cap, naming the setting", async () => {
		await expect(collect(infiniteScene(), { maxFrames: 10 })).rejects.toThrow(
			/maxFrames/,
		);
	});

	it("finite scenes under the default cap are unaffected", async () => {
		const scene = Scene.make(function* () {
			const circle = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			yield* Motion.tween(circle, { x: 0 }, { x: 100 }, "0.5 seconds");
		} as never);
		const frames = [...(await collect(scene, {}))];
		expect(frames).toHaveLength(31);
	});

	it("maxFrames: Infinity disables the cap", async () => {
		// pull well past a cap that would otherwise trip
		const frames = [
			...(await collect(infiniteScene(), { maxFrames: Infinity }, 50)),
		];
		expect(frames).toHaveLength(50);
	});
});
