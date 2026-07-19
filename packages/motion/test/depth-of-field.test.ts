import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as CameraMod from "../src/Camera";
import * as Color from "../src/Color";
import * as Motion from "../src/Motion";
import * as Projection from "../src/Projection";
import type * as Runner from "../src/Runner";
import { circleOfConfusion, MAX_SIGMA, quantizeSigma } from "../src/render/dof";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/Shapes";
import { render } from "./support/framebuffer";

type Entities = typeof Shapes.Circle | typeof Shapes.Group;
type Frame = Scene.Frame<Entities>;

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

describe("camera depth-of-field fields", () => {
	it("defaults: focus at the resting distance, aperture 0", async () => {
		const frame = await lastFrame(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 0, y: 0 });
			yield* Scene.tick;
		});
		const focal = Projection.defaultFocalLength(500);
		expect(frame.camera.focusDistance).toBe(Projection.defaultCameraZ(focal));
		expect(frame.camera.aperture).toBe(0);
	});

	it("a user-instantiated camera gets the same fills", async () => {
		const frame = await lastFrame(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 0, y: 0 });
			const cam = yield* Scene.instantiate(CameraMod.Camera, {});
			yield* Scene.setCamera(cam as never);
			yield* Scene.tick;
		});
		expect(frame.camera.focusDistance).toBe(
			Projection.defaultCameraZ(Projection.defaultFocalLength(500)),
		);
		expect(frame.camera.aperture).toBe(0);
	});

	it("rack focus is a plain tween", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 0, y: 0 });
			const cam = yield* Scene.instantiate(CameraMod.Camera, {
				focusDistance: 100,
				aperture: 8,
			});
			yield* Scene.setCamera(cam as never);
			yield* Scene.tick;
			yield* Motion.tweenTo(cam, { focusDistance: 500 }, "500 millis");
		});
		const values = frames.map((f) => f.camera.focusDistance);
		expect(values[0]).toBe(100);
		expect(values.at(-1)).toBe(500);
		// strictly increasing along the tween
		for (let i = 1; i < values.length; i++) {
			expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!);
		}
		expect(frames.at(-1)?.camera.aperture).toBe(8);
	});
});

describe("circle of confusion", () => {
	const camera: Projection.CameraView = {
		x: 0,
		y: 0,
		z: 1000,
		rotX: 0,
		rotY: 0,
		rotZ: 0,
		focalLength: 1000,
		focusDistance: 1000,
		aperture: 10,
	};

	it("zero exactly at the focus plane; zero with aperture 0", () => {
		expect(circleOfConfusion(1000, camera)).toBe(0);
		expect(circleOfConfusion(500, { ...camera, aperture: 0 })).toBe(0);
	});

	it("monotone in distance from the focus plane, both directions", () => {
		const near1 = circleOfConfusion(800, camera);
		const near2 = circleOfConfusion(600, camera);
		const far1 = circleOfConfusion(1200, camera);
		const far2 = circleOfConfusion(1600, camera);
		expect(near1).toBeGreaterThan(0);
		expect(near2).toBeGreaterThan(near1);
		expect(far1).toBeGreaterThan(0);
		expect(far2).toBeGreaterThan(far1);
	});

	it("scales with aperture and clamps at the ceiling", () => {
		const a5 = circleOfConfusion(2000, { ...camera, aperture: 5 });
		const a10 = circleOfConfusion(2000, camera);
		expect(a10).toBeCloseTo(a5 * 2, 6);
		expect(circleOfConfusion(100000, { ...camera, aperture: 10000 })).toBe(
			MAX_SIGMA,
		);
	});

	it("quantizes to steps with a sharp threshold", () => {
		expect(quantizeSigma(0.1)).toBe(0);
		expect(quantizeSigma(0.3)).toBe(0.5);
		expect(quantizeSigma(1.74)).toBe(1.5);
		expect(quantizeSigma(1.76)).toBe(2);
		expect(quantizeSigma(1e9)).toBe(MAX_SIGMA);
	});
});

describe("depth-of-field rendering", () => {
	const frameWith = (camera: Projection.CameraView): Scene.Frame<Entities> =>
		({
			instances: {
				// on the z=0 plane (view depth = resting distance = in focus)
				sharp: {
					data: Shapes.Circle.data.make({ x: 100, y: 150, radius: 30 }),
					entity: Shapes.Circle,
				},
				// far behind the focus plane
				blurry: {
					data: Shapes.Circle.data.make({
						x: 350,
						y: 150,
						z: -2000,
						radius: 60,
					}),
					entity: Shapes.Circle,
				},
				root: {
					data: Shapes.Group.data.make({ children: ["sharp", "blurry"] }),
					entity: Shapes.Group,
				},
			},
			root: "root",
			frameRate: 60,
			width: 500,
			height: 300,
			backgroundColor: Color.hex("#000000"),
			camera,
		}) as Scene.Frame<Entities>;

	it("aperture 0 renders byte-identical to a camera without DoF in play", async () => {
		const base = CameraMod.identity(500);
		const a = await render(frameWith(base));
		const b = await render(frameWith({ ...base, focusDistance: 123456 }));
		// focusDistance is irrelevant while aperture is 0: identical output
		for (const [x, y] of [
			[100, 150],
			[101, 150],
			[280, 150],
			[350, 150],
		] as const) {
			expect(a.at(x, y)).toEqual(b.at(x, y));
		}
	});

	it("focus-plane content stays sharp while off-plane content blurs", async () => {
		const base = CameraMod.identity(500);
		const dof = await render(frameWith({ ...base, aperture: 12 }));
		const off = await render(frameWith(base));

		// the sharp circle is identical with and without DoF (its run is sharp)
		expect(dof.at(100, 150)).toEqual(off.at(100, 150));
		// hard edge preserved: just outside the sharp circle stays background
		expect(dof.isPainted(100, 118)).toBe(false);

		// the far circle blurs: its projected edge softens, so pixels just
		// outside the crisp silhouette pick up spill. Compute its projected
		// footprint: depth = restingZ + 2000, scale = focal/depth.
		const focal = base.focalLength;
		const depth = base.z + 2000;
		const scale = focal / depth;
		const cx = 250 + (350 - 250) * scale;
		const cy = 150;
		const r = 60 * scale;
		// center still painted
		expect(dof.isPainted(Math.round(cx), cy)).toBe(true);
		// without DoF: crisp edge — 4px past the radius is background
		const probeX = Math.round(cx + r + 4);
		expect(off.isPainted(probeX, cy)).toBe(false);
		// with DoF: blur spill reaches past the silhouette
		expect(dof.isPainted(probeX, cy)).toBe(true);
	});

	it("same frame renders deterministically", async () => {
		const camera = { ...CameraMod.identity(500), aperture: 12 };
		const a = await render(frameWith(camera));
		const b = await render(frameWith(camera));
		for (const [x, y] of [
			[100, 150],
			[300, 150],
			[320, 160],
			[10, 10],
		] as const) {
			expect(a.at(x, y)).toEqual(b.at(x, y));
		}
	});
});
