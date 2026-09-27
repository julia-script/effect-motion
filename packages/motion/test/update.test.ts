import { Effect, Exit } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as S from "../src/Entity";
import * as Scene from "../src/Scene";
import { unreachable } from "./support/raise";

// runs the scene; resolves its frames, or the defect message it died with
const runScene = async (
	body: () => Generator<Effect.Effect<any, any, any>, void, never>,
) => {
	const exit = await Effect.runPromiseExit(
		Scene.stream(Scene.make(body as never) as never).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<any>, never, never>,
	);
	return Exit.isSuccess(exit)
		? { frames: [...exit.value], error: undefined }
		: {
				frames: [],
				error: JSON.stringify(exit, (_key, value) =>
					value instanceof Error ? value.message : value,
				),
			};
};

describe("Scene.update", () => {
	it("dies on a partial object, naming the instance and missing fields", async () => {
		const { error } = await runScene(function* () {
			const circle = yield* Scene.instantiate("Circle", {});
			// what an untyped caller can write: only the field it means to change
			yield* Scene.update(circle, { radius: 5 } as never);
			yield* Scene.tick;
		});
		expect(error).toContain("Scene.update: Circle");
		expect(error).toContain("position");
		expect(error).toContain("opacity");
	});

	it("dies when an updater returns partial data", async () => {
		const { error } = await runScene(function* () {
			const circle = yield* Scene.instantiate("Circle", {});
			yield* Scene.update(circle, () => ({ radius: 5 }) as never);
			yield* Scene.tick;
		});
		expect(error).toContain("missing required field(s)");
	});

	it("accepts full data and updaters, and omitted optional keys", async () => {
		const { frames, error } = await runScene(function* () {
			const circle = yield* Scene.instantiate("Circle", {});
			const data = yield* Scene.data(circle);
			yield* Scene.update(circle, { ...data, radius: 5 });
			yield* Scene.update(circle, (d) => ({
				...d,
				position: S.vec3({ x: 7 }),
			}));
			yield* Scene.tick;
		});
		expect(error).toBeUndefined();
		const last = frames.at(-1) ?? unreachable();
		const circle = Object.entries(last.instances).find(
			([id]) => id !== last.root,
		)?.[1] as { data: { radius: number; position: { x: number } } };
		expect(circle.data.radius).toBe(5);
		expect(circle.data.position.x).toBe(7);
	});
});
