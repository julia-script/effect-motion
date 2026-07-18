import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as CameraMod from "../src/Camera";
import * as Color from "../src/Color";
import * as Motion from "../src/Motion";
import type * as Projection from "../src/Projection";
import type * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import { render, renderExit } from "./support/framebuffer";

type Entities =
	| typeof Shapes.Circle
	| typeof Shapes.Rect
	| typeof Shapes.Group
	| typeof Shapes.Hud;
type Frame = Scene.Frame<Entities>;

const baseFrame = (
	instances: Frame["instances"],
	camera: Projection.CameraView,
): Frame =>
	({
		instances,
		root: "root",
		frameRate: 60,
		width: 500,
		height: 300,
		backgroundColor: Color.hex("#000000"),
		camera,
	}) as Frame;

const rootOf = (children: string[]) => ({
	data: Shapes.Group.data.make({ children }),
	entity: Shapes.Group,
});

describe("HUD rendering", () => {
	it("HUD content ignores camera movement; world content doesn't", async () => {
		const instances = (): Frame["instances"] =>
			({
				world: {
					data: Shapes.Circle.data.make({ x: 150, y: 150, radius: 25 }),
					entity: Shapes.Circle,
				},
				hud: {
					data: Shapes.Hud.data.make({ children: ["title"] }),
					entity: Shapes.Hud,
				},
				title: {
					data: Shapes.Circle.data.make({
						x: 400,
						y: 50,
						radius: 20,
						fill: Color.hex("#7f5af0"),
					}),
					entity: Shapes.Circle,
				},
				root: rootOf(["world", "hud"]),
			}) as Frame["instances"];

		const still = CameraMod.identity(500);
		const moved = { ...still, x: 80, y: 40, rotY: 0.3 };

		const a = await render(baseFrame(instances(), still));
		const b = await render(baseFrame(instances(), moved));

		// world circle moved off its resting position
		expect(a.isPainted(150, 150)).toBe(true);
		expect(b.isPainted(150, 150)).toBe(false);
		// HUD circle pinned to the glass in both
		expect(a.isPainted(400, 50)).toBe(true);
		expect(b.isPainted(400, 50)).toBe(true);
	});

	it("HUD paints over nearer world content", async () => {
		// a big world rect very near the camera, covering the HUD area
		const near = CameraMod.identity(500);
		const frame = baseFrame(
			{
				blocker: {
					data: Shapes.Rect.data.make({
						x: -500,
						y: -500,
						z: near.z - 100, // 100 units from the lens
						width: 2000,
						height: 2000,
						fill: Color.hex("#ff0000"),
					}),
					entity: Shapes.Rect,
				},
				hud: {
					data: Shapes.Hud.data.make({ children: ["badge"] }),
					entity: Shapes.Hud,
				},
				badge: {
					data: Shapes.Circle.data.make({
						x: 250,
						y: 150,
						radius: 30,
						fill: Color.hex("#00ff00"),
					}),
					entity: Shapes.Circle,
				},
				root: rootOf(["blocker", "hud"]),
			} as Frame["instances"],
			near,
		);
		const r = await render(frame);
		// the near blocker fills the screen...
		expect(r.at(30, 30)[0]).toBeGreaterThan(200);
		// ...but the HUD badge still paints on top of it
		expect(r.at(250, 150)[1]).toBeGreaterThan(200);
	});

	it("HUD stays sharp while aperture blurs off-plane world content", async () => {
		const camera = { ...CameraMod.identity(500), aperture: 12 };
		const sharpCamera = CameraMod.identity(500);
		const instances: Frame["instances"] = {
			farWorld: {
				data: Shapes.Circle.data.make({
					x: 120,
					y: 150,
					z: -2000,
					radius: 60,
				}),
				entity: Shapes.Circle,
			},
			hud: {
				data: Shapes.Hud.data.make({ children: ["badge"] }),
				entity: Shapes.Hud,
			},
			badge: {
				data: Shapes.Circle.data.make({
					x: 380,
					y: 150,
					radius: 30,
					fill: Color.hex("#00ff00"),
				}),
				entity: Shapes.Circle,
			},
			root: rootOf(["farWorld", "hud"]),
		} as Frame["instances"];

		const dof = await render(baseFrame(instances, camera));
		const off = await render(baseFrame(instances, sharpCamera));

		// HUD badge identical with and without aperture (structurally sharp):
		// crisp edge — just outside the radius stays background
		expect(dof.at(380, 150)).toEqual(off.at(380, 150));
		expect(dof.isPainted(380, 115)).toBe(false);

		// while the far world circle blurred (spill past its crisp silhouette)
		const focal = sharpCamera.focalLength;
		const scale = focal / (sharpCamera.z + 2000);
		const cx = Math.round(250 + (120 - 250) * scale);
		const probeX = Math.round(cx + 60 * scale + 4);
		expect(off.isPainted(probeX, 150)).toBe(false);
		expect(dof.isPainted(probeX, 150)).toBe(true);
	});

	it("Hud offset moves the subtree in screen coordinates; hud-in-hud composes", async () => {
		const frame = baseFrame(
			{
				hud: {
					data: Shapes.Hud.data.make({ x: 100, children: ["inner", "dot"] }),
					entity: Shapes.Hud,
				},
				inner: {
					data: Shapes.Hud.data.make({ y: 50, children: ["nested"] }),
					entity: Shapes.Hud,
				},
				dot: {
					data: Shapes.Circle.data.make({ x: 50, y: 40, radius: 10 }),
					entity: Shapes.Circle,
				},
				nested: {
					data: Shapes.Circle.data.make({ x: 200, y: 100, radius: 10 }),
					entity: Shapes.Circle,
				},
				root: rootOf(["hud"]),
			} as Frame["instances"],
			CameraMod.identity(500),
		);
		const r = await render(frame);
		// dot: hud offset (100,0) + (50,40) = (150,40)
		expect(r.isPainted(150, 40)).toBe(true);
		expect(r.isPainted(50, 40)).toBe(false);
		// nested: (100,0) + (0,50) + (200,100) = (300,150)
		expect(r.isPainted(300, 150)).toBe(true);
	});

	it("a Hud nested inside world content dies with the named defect", async () => {
		const frame = baseFrame(
			{
				g: {
					data: Shapes.Group.data.make({ children: ["hud"] }),
					entity: Shapes.Group,
				},
				hud: {
					data: Shapes.Hud.data.make({ children: ["dot"] }),
					entity: Shapes.Hud,
				},
				dot: {
					data: Shapes.Circle.data.make({ x: 10, y: 10, radius: 5 }),
					entity: Shapes.Circle,
				},
				root: rootOf(["g"]),
			} as Frame["instances"],
			CameraMod.identity(500),
		);
		const exit = await renderExit(frame);
		expect(exit._tag).toBe("Failure");
		// Error defects stringify to {} via JSON; Cause's own toString carries it
		expect(String((exit as { cause?: unknown }).cause)).toContain(
			'Hud "hud" is nested inside world content',
		);
	});
});

describe("HUD scene authoring", () => {
	// mirrors the established messy-R cast pattern from camera.test.ts
	const framesOf = (
		make: () => Generator<Effect.Effect<any, any, any>, void, never>,
		settings: Partial<Runner.Settings> = {},
	): Promise<Frame[]> =>
		Effect.runPromise(
			Scene.stream(Scene.make(make as never) as never, settings).pipe(
				Stream.runCollect,
			) as unknown as Effect.Effect<Iterable<Frame>, never, never>,
		).then((chunk) => [...chunk]);

	it("a sub-scene mounts into the HUD via Scene.play({ parent })", async () => {
		const lowerThird = Scene.make(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 30, y: 20, radius: 8 });
			yield* Scene.tick;
		} as never);

		const frames = await framesOf(function* () {
			const hud = yield* Scene.instantiate(Shapes.Hud, {});
			const handle = yield* Scene.play(lowerThird as never, {
				parent: hud as never,
			});
			yield* handle.finished;
		});
		const last = frames.at(-1)!;
		const hudEntry = Object.entries(last.instances).find(
			([, e]) => (e as any).entity.name === "shapes/Hud",
		);
		expect(hudEntry).toBeDefined();
		const children = (hudEntry![1] as any).data.children as string[];
		expect(children.length).toBe(1);
		// the mounted circle is a child of the Hud, not of the root
		const rootChildren = (last.instances[last.root] as any).data
			.children as string[];
		expect(rootChildren).toContain(hudEntry?.[0]);
		expect(rootChildren).not.toContain(children[0]);
	});

	it("the Hud container position tweens like any instance", async () => {
		const frames = await framesOf(function* () {
			const hud = yield* Scene.instantiate(Shapes.Hud, { x: -200 });
			yield* Scene.tick;
			yield* Motion.tweenTo(hud, { x: 0 }, "300 millis");
		});
		const xs = frames.map(
			(f) =>
				(
					Object.values(f.instances).find(
						(e) => (e as any).entity.name === "shapes/Hud",
					) as any
				)?.data.x,
		);
		expect(xs[0]).toBe(-200);
		expect(xs.at(-1)).toBe(0);
	});
});
