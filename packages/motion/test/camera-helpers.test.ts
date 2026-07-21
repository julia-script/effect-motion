import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Camera from "../src/Camera";
import * as Motion from "../src/Motion";
import * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import * as S from "../src/schemas";
import { unreachable } from "./support/raise";

type Frame = Scene.Frame<any>;

// established pattern (camera.test.ts): cast the driven stream
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

const exitOf = (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
) =>
	Effect.runPromiseExit(
		Scene.stream(
			Scene.make(make as never, { width: 500, height: 300 }) as never,
		).pipe(Stream.runDrain) as unknown as Effect.Effect<void, unknown, never>,
	);

const poiOf = (frame: Frame) => ({
	x: (frame.camera as { poiX?: number }).poiX,
	y: (frame.camera as { poiY?: number }).poiY,
	z: (frame.camera as { poiZ?: number }).poiZ,
});

// default settings: 500 wide → origin (250, 150), resting z from identity
const REST = Runner.identityCameraView(500);
const ORIGIN = { x: 250, y: 150 };

describe("lookAt", () => {
	it("instant: sets the POI from this frame on", async () => {
		const frames = await framesOf(function* () {
			const hero = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 400, y: 80, z: -200 }),
			});
			const cam = yield* Scene.camera;
			yield* cam.pipe(Camera.lookAt(hero));
			yield* Scene.tick;
		});
		expect(poiOf(frames.at(-1) ?? unreachable())).toEqual({
			x: 400,
			y: 80,
			z: -200,
		});
	});

	it("offset shifts the aim", async () => {
		const frames = await framesOf(function* () {
			const hero = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 100, y: 200 }),
			});
			const cam = yield* Scene.camera;
			yield* Camera.lookAt(cam, hero, undefined, undefined, { y: -40 });
			yield* Scene.tick;
		});
		expect(poiOf(frames.at(-1) ?? unreachable())).toEqual({
			x: 100,
			y: 160,
			z: 0,
		});
	});

	it("plain position and effect targets both resolve", async () => {
		const frames = await framesOf(function* () {
			const cam = yield* Scene.camera;
			yield* cam.pipe(Camera.lookAt({ x: 10, y: 20 }));
			yield* Scene.tick;
			// an Effect target: instantiation happens inside the helper
			yield* cam.pipe(
				Camera.lookAt(
					Scene.instantiate("Circle", { position: S.vec3({ x: 77, z: -5 }) }),
				),
			);
			yield* Scene.tick;
		});
		expect(poiOf(frames[0] ?? unreachable())).toEqual({ x: 10, y: 20, z: 0 });
		expect(poiOf(frames.at(-1) ?? unreachable())).toEqual({
			x: 77,
			y: 0,
			z: -5,
		});
	});

	it("eased re-aim retargets onto a moving target and lands exactly", async () => {
		const frames = await framesOf(function* () {
			const hero = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0, y: 0 }),
			});
			const cam = yield* Scene.camera;
			yield* cam.pipe(Camera.lookAt(hero)); // engage POI at the start pos
			yield* Scene.all([
				hero.pipe(Motion.moveTo({ x: 300 }, "1 second", "easeInOutCubic")),
				cam.pipe(Camera.lookAt(hero, "1 second", "easeInOutCubic")),
			]);
		});
		const last = frames.at(-1) ?? unreachable();
		expect(poiOf(last).x).toBe(300); // exact landing on the moving target
		// mid-flight the POI trails the hero (eased blend of start and current)
		const mid = frames[29] ?? unreachable();
		const heroMidX = (
			Object.values(mid.instances).find(
				(e: any) => e.data._tag === "Circle",
			) as any
		).data.position.x as number;
		expect(poiOf(mid).x).toBeGreaterThan(0);
		expect(poiOf(mid).x).toBeLessThan(heroMidX);
	});

	it("seeds on the unaimed axis when no POI exists (snap-free engage)", async () => {
		const target = { x: ORIGIN.x + 100, y: ORIGIN.y, z: 0 };
		const frames = await framesOf(function* () {
			const cam = yield* Scene.camera;
			yield* cam.pipe(Camera.lookAt(target, "1 second", "linear"));
		});
		// seed = camera world position pushed straight down -z by the target
		// distance; frame 0 is t = 1/60 of the way from seed to target
		const dist = Math.hypot(100, 0, REST.z);
		const seed = { x: ORIGIN.x, y: ORIGIN.y, z: REST.z - dist };
		const t = 1 / 60;
		const first = poiOf(frames[0] ?? unreachable());
		expect(first.x).toBeCloseTo(seed.x + (target.x - seed.x) * t, 8);
		expect(first.z).toBeCloseTo(seed.z + (target.z - seed.z) * t, 8);
	});
});

describe("follow", () => {
	it("camera after target: POI matches the target same-frame", async () => {
		const frames = await framesOf(function* () {
			const hero = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			const cam = yield* Scene.camera;
			yield* Scene.all([
				hero.pipe(Motion.moveTo({ x: 120 }, "1 second")),
				cam.pipe(Camera.follow(hero, "1 second")),
			]);
		});
		for (const [i, frame] of frames.slice(0, 60).entries()) {
			const heroX = (
				Object.values(frame.instances).find(
					(e: any) => e.data._tag === "Circle",
				) as any
			).data.position.x as number;
			expect(poiOf(frame).x, `frame ${i}`).toBe(heroX);
		}
	});

	it("camera before target: a deterministic one-frame trail", async () => {
		const run = () =>
			framesOf(function* () {
				const hero = yield* Scene.instantiate("Circle", {
					position: S.vec3({ x: 0 }),
				});
				const cam = yield* Scene.camera;
				yield* Scene.all([
					cam.pipe(Camera.follow(hero, "1 second")),
					hero.pipe(Motion.moveTo({ x: 120 }, "1 second")),
				]);
			});
		const a = await run();
		const heroXs = a.map(
			(f) =>
				(
					Object.values(f.instances).find(
						(e: any) => e.data._tag === "Circle",
					) as any
				).data.position.x as number,
		);
		// trails by exactly one frame...
		for (let i = 1; i < 60; i++) {
			expect(poiOf(a[i] ?? unreachable()).x).toBe(heroXs[i - 1]);
		}
		// ...and identically on every run (deterministic, not racy)
		const b = await run();
		expect(a.map((f) => poiOf(f).x)).toEqual(b.map((f) => poiOf(f).x));
	});

	it("pipes into sequential phases: follow → lookAt → follow", async () => {
		const frames = await framesOf(function* () {
			const a = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 50, y: 10 }),
			});
			const b = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 350, y: 90 }),
			});
			const cam = yield* Scene.camera;
			yield* cam.pipe(
				Camera.follow(a, "500 millis"),
				Camera.lookAt(b, "500 millis"),
				Camera.follow(b, "500 millis"),
			);
		});
		expect(poiOf(frames[29] ?? unreachable())).toEqual({ x: 50, y: 10, z: 0 }); // on a
		expect(poiOf(frames[59] ?? unreachable())).toEqual({ x: 350, y: 90, z: 0 }); // landed on b
		expect(poiOf(frames[75] ?? unreachable())).toEqual({ x: 350, y: 90, z: 0 }); // tracking b
	});
});

describe("orbit and dolly", () => {
	it("orbitTo travels the arc, radius and height preserved, POI fixed", async () => {
		const poi = { x: ORIGIN.x, y: ORIGIN.y, z: -350 };
		const radius = REST.z + 350;
		const frames = await framesOf(function* () {
			const cam = yield* Scene.camera;
			yield* cam.pipe(Camera.lookAt(poi));
			yield* cam.pipe(Camera.orbitTo(Math.PI / 2, "1 second"));
		});
		for (const frame of frames.slice(0, 60)) {
			const c = frame.camera as { x: number; y: number; z: number };
			const world = { x: ORIGIN.x + c.x, z: c.z };
			expect(Math.hypot(world.x - poi.x, world.z - poi.z)).toBeCloseTo(
				radius,
				6,
			);
			expect(c.y).toBe(0); // height preserved
		}
		const last = frames.at(-1)?.camera as { x: number; z: number };
		expect(ORIGIN.x + last.x).toBeCloseTo(poi.x + radius, 6); // sin(π/2)
		expect(last.z).toBeCloseTo(poi.z, 6); // cos(π/2)
	});

	it("dollyTo halves the distance along the same view axis", async () => {
		const frames = await framesOf(function* () {
			const cam = yield* Scene.camera;
			yield* cam.pipe(Camera.lookAt({ x: ORIGIN.x, y: ORIGIN.y, z: 0 }));
			yield* cam.pipe(Camera.dollyTo(REST.z / 2, "1 second"));
		});
		const last = frames.at(-1)?.camera as { x: number; y: number; z: number };
		expect(last.z).toBeCloseTo(REST.z / 2, 6);
		expect(last.x).toBeCloseTo(0, 6); // still on the same axis
		expect(last.y).toBeCloseTo(0, 6);
	});

	it("orbit without a POI dies loudly", async () => {
		const exit = await exitOf(function* () {
			const cam = yield* Scene.camera;
			yield* cam.pipe(Camera.orbitTo(1, "1 second"));
		});
		expect(exit._tag).toBe("Failure");
		expect(String(exit)).toMatch(/point of interest/);
	});
});
