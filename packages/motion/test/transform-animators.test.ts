import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as S from "../src/Entity";
import type * as Instance from "../src/Instance";
import * as Motion from "../src/Motion";
import * as Scene from "../src/Scene";

// the first non-root instance's data, per frame
const runScene = async (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
): Promise<Array<Record<string, any>>> => {
	const scene = Scene.make(make as never, { width: 500, height: 300 });
	const frames = await Effect.runPromise(
		Scene.stream(scene as never).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
	);
	return [...frames].map(
		(frame) =>
			Object.entries(frame.instances).find(([id]) => id !== frame.root)?.[1]
				?.data as Record<string, any>,
	);
};

const vec = (v: { x: number; y: number; z: number }) => [v.x, v.y, v.z];

describe("scale / scaleTo", () => {
	it("a number scales uniformly and lands exactly on target", async () => {
		const frames = await runScene(function* () {
			const dot = yield* Scene.instantiate("Circle", {});
			yield* dot.pipe(Motion.scaleTo(2.5, "1 second", "easeOutBack"));
		});
		expect(vec(frames.at(-1)?.scale)).toEqual([2.5, 2.5, 2.5]);
	});

	it("a partial vector animates only the named axes", async () => {
		const frames = await runScene(function* () {
			const box = yield* Scene.instantiate("Rect", {
				scale: S.vec3({ x: 1, y: 3, z: 1 }),
			});
			yield* Motion.scaleTo(box, { x: 2 }, "500 millis");
		});
		for (const data of frames) {
			expect(data.scale.y).toBe(3);
			expect(data.scale.z).toBe(1);
		}
		expect(frames.at(-1)?.scale.x).toBe(2);
	});

	it("scale takes an explicit origin: pop in from 0", async () => {
		const frames = await runScene(function* () {
			const dot = yield* Scene.instantiate("Circle", {});
			yield* dot.pipe(Motion.scale(0, 1, "1 second"));
		});
		// first animated frame (60 fps) is t = 1/60 of the way from 0
		expect(frames[0]?.scale.x).toBeCloseTo(1 / 60, 12);
		expect(vec(frames.at(-1)?.scale)).toEqual([1, 1, 1]);
	});

	it("scaling a Camera does not compile: it carries no scale", () => {
		const check = (camera: Instance.Instance<"Camera">) =>
			// @ts-expect-error Camera is not a TagsWith<"scale">
			Motion.scaleTo(camera, 2, "1 second");
		expect(check).toBeDefined();
	});
});

describe("rotate / rotateTo", () => {
	it("a number spins in-plane (z) and lands exactly on target", async () => {
		const frames = await runScene(function* () {
			const box = yield* Scene.instantiate("Rect", {});
			yield* box.pipe(Motion.rotateTo(2 * Math.PI, "1 second"));
		});
		for (const data of frames) {
			expect(data.rotation.x).toBe(0);
			expect(data.rotation.y).toBe(0);
		}
		// a full turn, not a no-op: halfway is π
		expect(frames[29]?.rotation.z).toBeCloseTo(Math.PI, 12);
		expect(frames.at(-1)?.rotation.z).toBe(2 * Math.PI);
	});

	it("rotate takes an explicit Euler origin and holds unnamed channels", async () => {
		const frames = await runScene(function* () {
			const card = yield* Scene.instantiate("Rect", {
				rotation: S.vec3({ z: 0.3 }),
			});
			yield* Motion.rotate(
				card,
				{ y: Math.PI / 2 },
				{ y: 0 },
				"500 millis",
				"easeOutCubic",
			);
		});
		expect(frames[0]?.rotation.y).toBeLessThan(Math.PI / 2);
		for (const data of frames) {
			expect(data.rotation.z).toBe(0.3);
		}
		expect(vec(frames.at(-1)?.rotation)).toEqual([0, 0, 0.3]);
	});

	it("rotating a Group writes only the group's rotation", async () => {
		const frames = await runScene(function* () {
			const group = yield* Scene.instantiate("Group", {});
			yield* group.pipe(Motion.rotateTo(1, "100 millis"));
		});
		expect(frames.at(-1)?.rotation.z).toBe(1);
	});
});
