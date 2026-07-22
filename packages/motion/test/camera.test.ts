import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as S from "../src/Entity";
import * as Motion from "../src/Motion";
import * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import { unreachable } from "./support/raise";

type Entities = S.EntityByTag<"Circle"> | S.EntityByTag<"Group">;
type Frame = Scene.Frame<Entities>;

// mirrors traits.test.ts: Scene.make/stream inference lands on messy R here,
// so the established pattern casts the driven stream to a plain Effect.
const framesOf = (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	settings: Partial<Runner.Settings> = {},
): Promise<Frame[]> =>
	Effect.runPromise(
		Scene.stream(
			Scene.make(make as never, { width: 500, height: 300 }) as never,
			settings,
		).pipe(Stream.runCollect) as unknown as Effect.Effect<
			Iterable<Frame>,
			never,
			never
		>,
	).then((chunk) => [...chunk]);

const lastFrame = (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	settings: Partial<Runner.Settings> = {},
) => framesOf(make, settings).then((frames) => frames.at(-1) ?? unreachable());

describe("camera state on the frame", () => {
	it("defaults to the resting 3D identity when never touched", async () => {
		const frame = await lastFrame(function* () {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 100, y: 0 }),
			});
			yield* Scene.tick;
		});
		expect(frame.camera).toEqual(Runner.identityCameraView(500));
	});

	it("the camera is not in the frame's instance map", async () => {
		const frame = await lastFrame(function* () {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 100, y: 0 }),
			});
			yield* Scene.tick;
		});
		expect(Object.keys(frame.instances)).not.toContain("camera");
	});

	it("a user-instantiated camera stays out of the render tree", async () => {
		const frame = await lastFrame(function* () {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 10, y: 10 }),
			});
			const cam2 = yield* Scene.instantiate("Camera", {
				position: S.vec3({ x: 40, y: 0 }),
			});
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
				yield* cam.pipe(Motion.tweenTo({ focalLength: 500 }, "1 second"));
				yield* Scene.update(cam, (d) => ({
					...d,
					rotation: S.vec3({ y: Math.PI / 4 }),
				}));
			},
			{ frameRate: 30 },
		);
		expect(frame.camera.rotY).toBeCloseTo(Math.PI / 4, 10);
		expect(frame.camera.focalLength).toBe(500);
	});

	it("world instance data is unchanged as the camera moves", async () => {
		const frames = await framesOf(
			function* () {
				yield* Scene.instantiate("Circle", {
					position: S.vec3({ x: 100, y: 0 }),
				});
				const cam = yield* Scene.camera;
				yield* cam.pipe(Motion.moveTo({ x: 300, z: -100 }, "1 second"));
			},
			{ frameRate: 30 },
		);
		const circleId =
			Object.keys((frames[0] ?? unreachable()).instances).find((id) =>
				id.startsWith("Circle"),
			) ?? unreachable();
		for (const frame of frames) {
			expect((frame.instances[circleId] ?? unreachable()).data.position.x).toBe(
				100,
			);
		}
		expect(frames.at(-1)?.camera.x).toBe(300);
	});
});
