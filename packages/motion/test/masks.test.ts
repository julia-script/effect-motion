import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Entity from "../src/Entity.js";
import * as Instance from "../src/Instance.js";
import * as Motion from "../src/Motion.js";
import * as Runner from "../src/Runner.js";
import * as Scene from "../src/Scene.js";
import { unreachable } from "./support/raise.js";

const framesOf = async (scene: Scene.AnyScene): Promise<Array<Scene.Frame>> => [
	...(await Effect.runPromise(
		Scene.stream(scene).pipe(Stream.runCollect) as unknown as Effect.Effect<
			Iterable<Scene.Frame>,
			never,
			never
		>,
	)),
];

const childrenOf = (frame: Scene.Frame, id: string): ReadonlyArray<string> => {
	const data = frame.instances[id]?.data ?? unreachable();
	return Entity.isContainer(data) ? data.children : unreachable();
};

describe("mask authoring and frame state", () => {
	it("types allow paintable endpoints and reject cameras", () => {
		const typecheck = () => {
			const rect = Instance.makeInstance("rect", "Rect");
			const circle = Instance.makeInstance("circle", "Circle");
			const camera = Instance.makeInstance("camera", "Camera");
			Scene.setMask(rect, circle);
			Scene.clearMask(rect);
			// @ts-expect-error Camera is view state, not a mask target
			Scene.setMask(camera, circle);
			// @ts-expect-error Camera cannot provide source coverage
			Scene.setMask(rect, camera);
			// @ts-expect-error Camera cannot have a mask cleared
			Scene.clearMask(camera);
		};
		expect(typecheck).toBeDefined();
	});

	it("attaches, replaces, clears, and reattaches without changing the tree", async () => {
		const scene = Scene.make(function* () {
			const target = yield* Scene.instantiate("Rect", {});
			const first = yield* Scene.instantiate("Circle", {});
			const second = yield* Scene.instantiate("Text", { text: "mask" });
			yield* Scene.setMask(target, first);
			yield* Scene.tick;
			yield* Scene.setMask(target, second, { mode: "inverse" });
			yield* Scene.tick;
			yield* Scene.clearMask(target);
			yield* Scene.clearMask(target);
			yield* Scene.tick;
			yield* Scene.setMask(target, first);
			yield* Scene.tick;
		});
		const frames = await framesOf(scene);
		const [first, second, cleared, restored] = frames;
		const targetId =
			childrenOf(first ?? unreachable(), "root")[0] ?? unreachable();
		const firstId =
			childrenOf(first ?? unreachable(), "root")[1] ?? unreachable();
		const secondId =
			childrenOf(first ?? unreachable(), "root")[2] ?? unreachable();
		expect(first?.masks).toEqual({
			[targetId]: { sourceId: firstId, mode: "alpha" },
		});
		expect(second?.masks).toEqual({
			[targetId]: { sourceId: secondId, mode: "inverse" },
		});
		expect(cleared?.masks).toEqual({});
		expect(restored?.masks).toEqual({
			[targetId]: { sourceId: firstId, mode: "alpha" },
		});
		expect(first?.masks).toEqual({
			[targetId]: { sourceId: firstId, mode: "alpha" },
		});
		for (const frame of frames) {
			expect(childrenOf(frame, "root")).toEqual([targetId, firstId, secondId]);
		}
	});

	it("emits separate mask values for each frame and live Runner state", async () => {
		const scene = Scene.make(function* () {
			const target = yield* Scene.instantiate("Rect", {});
			const source = yield* Scene.instantiate("Circle", {});
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
			yield* Scene.tick;
			yield* Scene.tick;
		});
		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const running = yield* Scene.run(scene);
					const first = (yield* Scene.step(running)) ?? unreachable();
					const second = (yield* Scene.step(running)) ?? unreachable();
					const targetId = childrenOf(first, "root")[0] ?? unreachable();
					const firstMask = first.masks?.[targetId] ?? unreachable();
					const secondMask = second.masks?.[targetId] ?? unreachable();
					expect(firstMask).not.toBe(secondMask);
					expect(Reflect.set(firstMask, "mode", "inverse")).toBe(true);
					expect(secondMask.mode).toBe("alpha");
					expect((yield* running.runner.state).masks[targetId]?.mode).toBe(
						"alpha",
					);
					const third = (yield* Scene.step(running)) ?? unreachable();
					expect(third.masks?.[targetId]?.mode).toBe("alpha");
				}),
			),
		);
	});

	it("source and target animate independently with exact, repeatable endpoints", async () => {
		const scene = Scene.make(function* () {
			const target = yield* Scene.instantiate("Text", {
				text: "hello",
				opacity: 1,
			});
			const source = yield* Scene.instantiate("Circle", {
				position: Entity.vec3({ x: 0 }),
			});
			yield* Scene.setMask(target, source);
			yield* Scene.all([
				Motion.moveTo(source, { x: 120 }, "1 second"),
				Motion.fadeTo(target, 0.25, "1 second"),
			]);
		});
		const first = await framesOf(scene);
		const second = await framesOf(scene);
		expect(first).toEqual(second);
		expect(first).toHaveLength(61);
		const last = first.at(-1) ?? unreachable();
		const [targetId, sourceId] = childrenOf(last, "root");
		const target = last.instances[targetId ?? unreachable()]?.data;
		const source = last.instances[sourceId ?? unreachable()]?.data;
		expect(target?._tag === "Text" ? target.opacity : unreachable()).toBe(0.25);
		expect(source?._tag === "Circle" ? source.position.x : unreachable()).toBe(
			120,
		);
		expect(last.masks?.[targetId ?? unreachable()]).toEqual({
			sourceId,
			mode: "alpha",
		});
	});

	it("rejects missing, unmounted, overlapping, owned, and cyclic relationships", async () => {
		const missing = Scene.make(function* () {
			const target = yield* Scene.instantiate("Rect", {});
			const source = Instance.makeInstance("gone", "Circle");
			yield* Scene.setMask(target, source);
		});
		await expect(framesOf(missing)).rejects.toThrow(
			/Rect_\d+.*gone.*missing or destroyed/,
		);

		const unmounted = Scene.make(function* () {
			const target = yield* Scene.instantiate("Rect", {});
			const source = yield* Scene.instantiate("Circle", {});
			const root = (yield* Runner.Runner).root;
			yield* Scene.removeChild(root, source);
			yield* Scene.setMask(target, source);
		});
		await expect(framesOf(unmounted)).rejects.toThrow(/endpoint is unmounted/);

		const overlap = Scene.make(function* () {
			const child = yield* Scene.instantiate("Circle", {});
			const group = yield* Scene.instantiate("Group", { children: [child] });
			yield* Scene.setMask(child, group);
		});
		await expect(framesOf(overlap)).rejects.toThrow(
			/target "Circle_\d+", source "Group_\d+": source and target subtrees overlap/,
		);

		const owned = Scene.make(function* () {
			const first = yield* Scene.instantiate("Rect", {});
			const second = yield* Scene.instantiate("Rect", {});
			const source = yield* Scene.instantiate("Circle", {});
			yield* Scene.setMask(first, source);
			yield* Scene.setMask(second, source);
		});
		await expect(framesOf(owned)).rejects.toThrow(
			/source already masks target/,
		);

		const cyclic = Scene.make(function* () {
			const a = yield* Scene.instantiate("Rect", {});
			const b = yield* Scene.instantiate("Rect", {});
			const groupA = yield* Scene.instantiate("Group", { children: [a] });
			const groupB = yield* Scene.instantiate("Group", { children: [b] });
			yield* Scene.setMask(a, groupB);
			yield* Scene.setMask(b, groupA);
		});
		await expect(framesOf(cyclic)).rejects.toThrow(/mask reference cycle/);
	});

	it("allows a source to be masked by another independent source", async () => {
		const scene = Scene.make(function* () {
			const target = yield* Scene.instantiate("Rect", {});
			const source = yield* Scene.instantiate("Circle", {});
			const sourceMask = yield* Scene.instantiate("Text", { text: "shape" });
			yield* Scene.setMask(target, source);
			yield* Scene.setMask(source, sourceMask, { mode: "inverse" });
			yield* Scene.tick;
		});
		const frame = (await framesOf(scene))[0] ?? unreachable();
		const [targetId, sourceId, sourceMaskId] = childrenOf(frame, "root");
		expect(frame.masks).toEqual({
			[targetId ?? unreachable()]: { sourceId, mode: "alpha" },
			[sourceId ?? unreachable()]: { sourceId: sourceMaskId, mode: "inverse" },
		});
	});

	it("keeps valid reparenting and rejects a tier change before mutating the tree", async () => {
		const scene = Scene.make(function* () {
			const target = yield* Scene.instantiate("Rect", {});
			const source = yield* Scene.instantiate("Circle", {});
			const world = yield* Scene.instantiate("Group", {});
			const hud = yield* Scene.instantiate("Hud", {});
			yield* Scene.setMask(target, source);
			yield* Scene.appendChild(world, source);
			yield* Scene.tick;
			const exit = yield* Effect.exit(Scene.appendChild(hud, source));
			expect(exit._tag).toBe("Failure");
			yield* Scene.tick;
		});
		const frames = await framesOf(scene);
		const before = frames[0] ?? unreachable();
		const after = frames[1] ?? unreachable();
		expect(after.masks).toEqual(before.masks);
		const worldId =
			childrenOf(before, "root").find(
				(id) => before.instances[id]?.data._tag === "Group",
			) ?? unreachable();
		expect(childrenOf(after, worldId)).toEqual(childrenOf(before, worldId));
	});

	it("rejects world/Hud and cross-composition pairs", async () => {
		const tier = Scene.make(function* () {
			const target = yield* Scene.instantiate("Rect", {});
			const hud = yield* Scene.instantiate("Hud", {
				children: [Scene.instantiate("Circle", {})],
			});
			const sourceId = (yield* Scene.data(hud)).children[0] ?? unreachable();
			yield* Scene.setMask(target, Instance.makeInstance(sourceId, "Circle"));
		});
		await expect(framesOf(tier)).rejects.toThrow(
			/cross-tier world\/Hud boundary/,
		);

		let childSource: Instance.Instance<"Circle"> | undefined;
		const child = Scene.make(function* () {
			childSource = yield* Scene.instantiate("Circle", {});
			yield* Scene.tick;
		});
		const composition = Scene.make(function* () {
			const target = yield* Scene.instantiate("Rect", {});
			yield* Scene.play(child);
			yield* Scene.tick;
			yield* Scene.setMask(target, childSource ?? unreachable());
		});
		await expect(framesOf(composition)).rejects.toThrow(
			/cross-composition boundary/,
		);
	});

	it("keeps an attachment and parent stable when reparenting would cross a composition", async () => {
		const child = Scene.make(function* () {
			yield* Scene.tick;
		});
		const scene = Scene.make(function* () {
			const target = yield* Scene.instantiate("Rect", {});
			const source = yield* Scene.instantiate("Circle", {});
			const played = yield* Scene.play(child);
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
			const failed = yield* Effect.exit(
				Scene.appendChild(played.group, source),
			);
			expect(failed._tag).toBe("Failure");
			yield* Scene.tick;
		});
		const frames = await framesOf(scene);
		const before = frames[0] ?? unreachable();
		const after = frames[1] ?? unreachable();
		expect(after.masks).toEqual(before.masks);
		expect(childrenOf(after, "root")).toEqual(childrenOf(before, "root"));
	});

	it("clears edges on detach and ancestor destruction, including orphaned descendants", async () => {
		const scene = Scene.make(function* () {
			const target = yield* Scene.instantiate("Rect", {});
			const source = yield* Scene.instantiate("Circle", {});
			const sourceGroup = yield* Scene.instantiate("Group", {
				children: [source],
			});
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
			const runner = yield* Runner.Runner;
			runner.destroy(sourceGroup);
			yield* Scene.tick;
			yield* Scene.appendChild(runner.root, source);
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
			yield* Scene.removeChild(runner.root, target);
			yield* Scene.tick;
		});
		const frames = await framesOf(scene);
		expect(Object.keys(frames[0]?.masks ?? {})).toHaveLength(1);
		expect(frames[1]?.masks).toEqual({});
		expect(frames[2]?.masks).toEqual(frames[0]?.masks);
		expect(frames[3]?.masks).toEqual({});
		const sourceId =
			Object.values(frames[0]?.masks ?? {})[0]?.sourceId ?? unreachable();
		expect(frames[1]?.instances[sourceId]?.data._tag).toBe("Circle");
		expect(childrenOf(frames[1] ?? unreachable(), "root")).not.toContain(
			sourceId,
		);
	});
});
