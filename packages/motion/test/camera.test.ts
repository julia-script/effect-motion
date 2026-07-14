import { Effect } from "effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as CameraMod from "../src/Camera";
import * as Motion from "../src/Motion";
import type * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import * as Svg from "../src/svg";

type Entities = typeof Shapes.Circle | typeof Shapes.Group;
type Frame = Scene.Frame<Entities>;

// mirrors traits.test.ts: Scene.make/stream inference lands on unknown/messy R
// here, so the established pattern is to cast the driven stream to a plain
// Effect. The runtime values are exactly the frames.
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
	it("defaults to identity when never touched", async () => {
		const frame = await lastFrame(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 100, y: 0 });
			yield* Scene.tick;
		});
		expect(frame.camera).toEqual({ x: 0, y: 0, zoom: 1 });
	});

	it("the camera is not in the frame's instance map", async () => {
		const frame = await lastFrame(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 100, y: 0 });
			yield* Scene.tick;
		});
		// only the circle (+ root); the camera instance is view state, omitted
		expect(Object.keys(frame.instances)).not.toContain("camera");
	});

	it("a user-instantiated camera stays out of the render tree", async () => {
		// regression: instantiating a second Camera must NOT mount it under
		// root — no sink renders a Camera, so the renderer would die on it.
		const frame = await lastFrame(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 10, y: 10 });
			const cam2 = yield* Scene.instantiate(CameraMod.Camera, {
				x: 40,
				y: 0,
			});
			yield* Scene.setCamera(cam2 as never);
			yield* Scene.tick;
		});
		// the extra camera is not a child of root (root has only the circle)
		const rootData = frame.instances[frame.root]!.data as {
			children: ReadonlyArray<string>;
		};
		const rootChildren = rootData.children;
		expect(rootChildren.some((id) => id.startsWith("Camera"))).toBe(false);
		// and the swapped-in camera drives the view
		expect(frame.camera.x).toBe(40);
	});

	it("renders without error when a second camera is active", async () => {
		// the SVG sink must fold the frame with no Camera in the tree
		const frame = await lastFrame(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 10, y: 10 });
			const cam2 = yield* Scene.instantiate(CameraMod.Camera, { x: 40 });
			yield* Scene.setCamera(cam2 as never);
			yield* Scene.tick;
		});
		const layers = Svg.layer.pipe(Layer.provideMerge(Svg.shapesLayer));
		const svg = await Effect.runPromise(
			Effect.gen(function* () {
				const renderer = yield* Svg.SvgRenderer.Context;
				return yield* renderer.render(frame, {});
			}).pipe(Effect.provide(layers)),
		);
		expect(svg).toContain("<circle");
		expect(svg).not.toContain("Camera");
	});
});

describe("camera animated by the existing primitives", () => {
	it("moveTo lands the pan frame-exactly on target", async () => {
		const frame = await lastFrame(
			function* () {
				const cam = yield* Scene.camera;
				yield* cam.pipe(Motion.moveTo({ x: 400, y: 50 }, "1 second"));
			},
			{ frameRate: 30 },
		);
		expect(frame.camera.x).toBe(400);
		expect(frame.camera.y).toBe(50);
	});

	it("tweenTo lands the zoom frame-exactly on target", async () => {
		const frame = await lastFrame(
			function* () {
				const cam = yield* Scene.camera;
				yield* cam.pipe(Motion.tweenTo({ zoom: 2 }, "1 second"));
			},
			{ frameRate: 30 },
		);
		expect(frame.camera.zoom).toBe(2);
	});

	it("world instance data is unchanged as the camera pans and zooms", async () => {
		const frames = await framesOf(
			function* () {
				yield* Scene.instantiate(Shapes.Circle, { x: 100, y: 0 });
				const cam = yield* Scene.camera;
				yield* cam.pipe(Motion.moveTo({ x: 300 }, "1 second"));
			},
			{ frameRate: 30 },
		);
		const circleId = Object.keys(frames[0]!.instances).find((id) =>
			id.startsWith("shapes/Circle"),
		)!;
		// the circle's world x never moved despite the camera panning to 300
		for (const frame of frames) {
			expect((frame.instances[circleId]!.data as { x: number }).x).toBe(100);
		}
		expect(frames.at(-1)!.camera.x).toBe(300);
	});
});

// the sink applies the camera as a per-layer transform; assert the math
describe("SVG sink applies the camera per layer", () => {
	const layers = Svg.layer.pipe(Layer.provideMerge(Svg.shapesLayer));
	const renderString = (frame: Scene.Frame<Entities>) =>
		Effect.runPromise(
			Effect.gen(function* () {
				const renderer = yield* Svg.SvgRenderer.Context;
				return yield* renderer.render(frame, {});
			}).pipe(Effect.provide(layers)),
		);

	// render a one-layer scene, overriding the camera on the frame
	const renderLayer = async (
		props: { depth?: number },
		camera: { x: number; y: number; zoom: number },
	) => {
		const frame = await lastFrame(
			function* () {
				yield* Scene.instantiate(Shapes.Group, {
					...props,
					children: [Scene.instantiate(Shapes.Circle, { x: 10, y: 10 })],
				});
				yield* Scene.tick;
			},
			{ width: 500, height: 300 },
		);
		return renderString({ ...frame, camera });
	};

	it("identity camera adds no transform (output unchanged)", async () => {
		const svg = await renderLayer({}, { x: 0, y: 0, zoom: 1 });
		expect(svg).not.toContain("transform");
	});

	it("a full-depth layer pans by the full camera", async () => {
		const svg = await renderLayer({}, { x: 100, y: 0, zoom: 1 });
		// pan translates the layer left by 100 (world moves opposite the camera)
		expect(svg).toContain("translate(-100 0)");
	});

	it("a depth 0.3 layer pans by 30 (parallax)", async () => {
		const svg = await renderLayer({ depth: 0.3 }, { x: 100, y: 0, zoom: 1 });
		// 100 * 0.3 = 30 (far layer lags the full-depth 100)
		expect(svg).toContain("translate(-30 0)");
	});

	it("a depth 0 layer is screen-fixed (no pan, no zoom)", async () => {
		const svg = await renderLayer({ depth: 0 }, { x: 100, y: 50, zoom: 2 });
		// HUD: the camera has no effect on this layer at all
		expect(svg).not.toContain("transform");
	});

	it("zoom scales about the viewport center (250,150)", async () => {
		const svg = await renderLayer({}, { x: 0, y: 0, zoom: 2 });
		expect(svg).toContain("translate(250 150) scale(2) translate(-250 -150)");
	});
});
