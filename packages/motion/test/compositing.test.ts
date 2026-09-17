import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Entity from "../src/Entity.js";
import * as Scene from "../src/Scene.js";

describe("compositing metadata", () => {
	it("defaults to paint scenes and inherited groups", () => {
		expect(
			Scene.make(function* () {
				yield* Scene.tick;
			}).compositing,
		).toBe("paint");
		expect(Entity.Group.make({}).compositing).toBe("inherit");
		expect(Entity.Group.make({ compositing: "paint" }).compositing).toBe(
			"paint",
		);
	});
	it("retains root and mounted modes through deterministic replay", async () => {
		const child = Scene.make(function* () {
			yield* Scene.tick;
		});
		const parent = Scene.make(
			function* () {
				const mount = yield* Scene.play(child);
				yield* mount.finished;
			},
			{ compositing: "depth" },
		);
		const collect = () =>
			Effect.runPromise(Scene.stream(parent).pipe(Stream.runCollect));
		const first = await collect();
		expect(first.length).toBeGreaterThan(0);
		for (const frame of first) {
			expect(frame.compositing).toBe("depth");
			for (const comp of Object.values(frame.comps))
				expect(comp.compositing).toBe("paint");
		}
		expect(first.some((frame) => Object.keys(frame.comps).length > 0)).toBe(
			true,
		);
		expect(await collect()).toEqual(first);
	});
});
