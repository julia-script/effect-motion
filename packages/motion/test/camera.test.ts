import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as CameraMod from "../src/Camera";
import * as Motion from "../src/Motion";
import type * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import { render } from "./support/framebuffer";

type Entities = typeof Shapes.Circle | typeof Shapes.Group;
type Frame = Scene.Frame<Entities>;

// mirrors traits.test.ts: Scene.make/stream inference lands on messy R here,
// so the established pattern casts the driven stream to a plain Effect.
const framesOf = (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	settings: Partial<Runner.Settings> = {},
): Promise<Frame[]> =>
	Effect.runPromise(
		Scene.stream(Scene.make(make as never) as never, settings).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Frame>, never, never>,
	).then((chunk) => [...chunk]);

const lastFrame = (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	settings: Partial<Runner.Settings> = {},
) => framesOf(make, settings).then((frames) => frames.at(-1)!);

describe("camera state on the frame", () => {
	it("defaults to the resting 3D identity when never touched", async () => {
		const frame = await lastFrame(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 100, y: 0 });
			yield* Scene.tick;
		});
		expect(frame.camera).toEqual(CameraMod.IDENTITY);
	});

	it("the camera is not in the frame's instance map", async () => {
		const frame = await lastFrame(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 100, y: 0 });
			yield* Scene.tick;
		});
		expect(Object.keys(frame.instances)).not.toContain("camera");
	});

	it("a user-instantiated camera stays out of the render tree", async () => {
		const frame = await lastFrame(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 10, y: 10 });
			const cam2 = yield* Scene.instantiate(CameraMod.Camera, { x: 40, y: 0 });
			yield* Scene.setCamera(cam2 as never);
			yield* Scene.tick;
		});
		const rootData = frame.instances[frame.root]?.data as {
			children: ReadonlyArray<string>;
		};
		expect(rootData.children.some((id) => id.startsWith("Camera"))).toBe(false);
		expect(frame.camera.x).toBe(40);
	});
});

describe("camera animated by the existing primitives", () => {
	it("moveTo lands x/y/z frame-exactly on target", async () => {
		const frame = await lastFrame(
			function* () {
				const cam = yield* Scene.camera;
				yield* cam.pipe(Motion.moveTo({ x: 400, y: 50, z: -200 }, "1 second"));
			},
			{ frameRate: 30 },
		);
		expect(frame.camera.x).toBe(400);
		expect(frame.camera.y).toBe(50);
		expect(frame.camera.z).toBe(-200);
	});

	it("tweenTo lands rotation and focalLength frame-exactly", async () => {
		const frame = await lastFrame(
			function* () {
				const cam = yield* Scene.camera;
				yield* cam.pipe(
					Motion.tweenTo({ rotY: Math.PI / 4, focalLength: 500 }, "1 second"),
				);
			},
			{ frameRate: 30 },
		);
		expect(frame.camera.rotY).toBeCloseTo(Math.PI / 4, 10);
		expect(frame.camera.focalLength).toBe(500);
	});

	it("world instance data is unchanged as the camera moves", async () => {
		const frames = await framesOf(
			function* () {
				yield* Scene.instantiate(Shapes.Circle, { x: 100, y: 0 });
				const cam = yield* Scene.camera;
				yield* cam.pipe(Motion.moveTo({ x: 300, z: -100 }, "1 second"));
			},
			{ frameRate: 30 },
		);
		const circleId = Object.keys(frames[0]?.instances).find((id) =>
			id.startsWith("shapes/Circle"),
		)!;
		for (const frame of frames) {
			expect((frame.instances[circleId]?.data as { x: number }).x).toBe(100);
		}
		expect(frames.at(-1)?.camera.x).toBe(300);
	});
});

// the renderer projects every instance through the camera; assert the painted
// results. Positions are screen coords in a 500×300 frame (origin = 250,150).
describe("the renderer projects instances through the camera", () => {
	const oneCircle = async (
		props: { x?: number; y?: number; z?: number; radius?: number },
		camera: CameraMod.CameraState = CameraMod.IDENTITY,
	) => {
		const frame = await lastFrame(
			function* () {
				yield* Scene.instantiate(Shapes.Circle, props);
				yield* Scene.tick;
			},
			{ width: 500, height: 300 },
		);
		return render({ ...frame, camera } as Frame);
	};

	it("identity camera places z=0 content at its plain-2D screen position", async () => {
		const r = await oneCircle({ x: 200, y: 120, radius: 15 });
		expect(r.isPainted(200, 120)).toBe(true);
	});

	it("panning the camera shifts a z=0 shape on screen", async () => {
		// camera pans +100 in x → the world shifts -100 on screen. A circle at
		// world x=200 lands at screen x=100; its original 200 is now background.
		const r = await oneCircle(
			{ x: 200, y: 120, radius: 15 },
			{ ...CameraMod.IDENTITY, x: 100 },
		);
		expect(r.isPainted(100, 120)).toBe(true);
		expect(r.isPainted(200, 120)).toBe(false);
	});

	it("a receding shape (z<0) is scaled down by perspective", async () => {
		// depth = F - (-1000) = 2000; scale = F/2000 = 0.5 (F=1000). A radius-40
		// circle whose center is world (0,0) projects to screen
		// (250 + (0-250)*0.5, 150 + (0-150)*0.5) = (125, 75), shrunk to ~20px.
		const r = await oneCircle({ x: 0, y: 0, z: -1000, radius: 40 });
		expect(r.isPainted(125, 75)).toBe(true); // scaled center
		// a point at the full-scale radius (40px away) is outside the shrunk circle
		expect(r.isPainted(125 + 32, 75)).toBe(false);
	});
});

describe("depth-sorted render order", () => {
	it("a farther shape paints behind a nearer one, whatever the tree order", async () => {
		const frame = await lastFrame(function* () {
			// author near (red) first, far (green) second; depth must still
			// decide. Both overlap screen center so the winner shows there.
			yield* Scene.instantiate(Shapes.Circle, {
				x: 250,
				y: 150,
				radius: 20,
				fill: "#ff0000",
			}); // near, z=0
			yield* Scene.instantiate(Shapes.Circle, {
				x: 250,
				y: 150,
				z: -400,
				radius: 20,
				fill: "#00ff00",
			}); // far
			yield* Scene.tick;
		});
		const r = await render(frame);
		// near (red) painted last, on top: red wins the shared center
		const [red, green] = r.at(250, 150);
		expect(red).toBeGreaterThan(200);
		expect(green).toBeLessThan(80);
	});
});
