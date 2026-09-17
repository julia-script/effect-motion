import * as Effect from "effect/Effect";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Runner from "effect-motion/Runner";
import type * as Scene from "effect-motion/Scene";
import { expect, it } from "vitest";
import * as NodeRenderer from "../src/node.js";
import * as Stroke from "../src/Stroke.js";
import { unreachable } from "./support/raise.js";

it("reuses coverage through static frames/fades and releases every removed mask", async () => {
	await Effect.runPromise(
		Effect.scoped(
			Effect.gen(function* () {
				const renderer = yield* NodeRenderer.make({ width: 400, height: 300 });
				const ids = Array.from({ length: 16 }, (_, i) => `rect-${i}`);
				const frame = (opacity: number, width = 40): Scene.Frame => ({
					instances: Object.fromEntries([
						["root", { data: Entity.Group.make({ children: ids }) }],
						...ids.map((id, i) => [
							id,
							{
								data: Entity.Rect.make({
									position: Entity.vec3({
										x: (i % 4) * 70 - 105,
										y: Math.floor(i / 4) * 60 - 90,
									}),
									width,
									height: 30,
									strokeWidth: 6,
									fillColor: Color.transparent,
									strokeColor: Color.white,
									opacity,
								}),
							},
						]),
					]),
					root: "root",
					width: 400,
					height: 300,
					frameRate: 60,
					compositing: "paint",
					comps: {},
					camera: Runner.identityCameraView(400),
					backgroundColor: Color.black,
				});
				for (const opacity of [0.25, 0.5, 0.75, 1, 1, 1, 0.5, 0])
					yield* NodeRenderer.renderToPng(renderer, frame(opacity));
				const strokes: Array<Stroke.Stroke> = [];
				for (const entry of renderer.sync.retained.values())
					entry.retained.object.traverse((object) => {
						const stroke = Stroke.fromObject(object);
						if (stroke !== undefined) strokes.push(stroke);
					});
				expect(strokes).toHaveLength(16);
				for (const stroke of strokes)
					expect(stroke.stats).toEqual({
						geometryBuilds: 1,
						rasterizations: 1,
						allocations: 1,
						resizes: 0,
					});
				let disposed = 0;
				for (const stroke of strokes)
					(stroke.target ?? unreachable())[
						"~three.renderTarget"
					].addEventListener("dispose", () => disposed++);
				yield* NodeRenderer.renderToPng(renderer, {
					...frame(1),
					instances: { root: { data: Entity.Group.make({}) } },
				});
				expect(renderer.sync.retained.size).toBe(0);
				expect(disposed).toBe(16);
			}),
		),
	);
}, 30_000);

it("keeps fractional placement while DPR-2 paint surfaces and masks resize", async () => {
	await Effect.runPromise(
		Effect.scoped(
			Effect.gen(function* () {
				const renderer = yield* NodeRenderer.make({
					width: 200,
					height: 150,
					pixelRatio: 2,
				});
				let previous: Stroke.Stroke | undefined;
				let target: Stroke.Stroke["target"] = null;
				for (let i = 0; i < 12; i++) {
					const x = -15.25 + i / 4;
					const frame: Scene.Frame = {
						instances: {
							root: { data: Entity.Group.make({ children: ["group"] }) },
							group: {
								data: Entity.Group.make({
									compositing: "paint",
									children: ["rect"],
									scale: Entity.vec3({ x: 1 + i / 20, y: 1 + i / 20, z: 1 }),
								}),
							},
							rect: {
								data: Entity.Rect.make({
									width: 30 + i / 4,
									height: 20,
									position: Entity.vec3({ x }),
									strokeWidth: 0.25 + i / 16,
									strokeColor: Color.white,
									fillColor: Color.transparent,
								}),
							},
						},
						root: "root",
						frameRate: 60,
						width: 200,
						height: 150,
						compositing: "depth",
						camera: Runner.identityCameraView(200),
						comps: {},
						backgroundColor: Color.black,
					};
					yield* NodeRenderer.renderToPng(renderer, frame);
					const comp = renderer.sync.comps.get("group") ?? unreachable();
					expect(comp.rt?.["~three.renderTarget"].samples).toBe(4);
					const object =
						comp.sync.retained.get("rect")?.retained.object ?? unreachable();
					expect(object.position.x).toBe(x);
					const stroke =
						Stroke.fromObject(object.children[1] ?? unreachable()) ??
						unreachable();
					previous ??= stroke;
					target ??= stroke.target;
					expect(stroke).toBe(previous);
					expect(stroke.target).toBe(target);
					expect(stroke.target?.["~three.renderTarget"].samples).toBe(4);
					expect(
						stroke.target?.["~three.renderTarget"].width,
					).toBeGreaterThanOrEqual(Math.ceil(stroke.bounds.width * 4));
				}
				expect(previous?.stats.allocations).toBe(1);
				expect(previous?.stats.resizes).toBe(11);
			}),
		),
	);
}, 30_000);
