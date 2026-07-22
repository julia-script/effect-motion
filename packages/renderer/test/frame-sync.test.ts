import { ThreeRaw as THREE, Scene as ThreeScene } from "@effect-motion/three";
import { Effect, Exit } from "effect";
import * as Stream from "effect/Stream";
import { Color, Runner, Entities as S, Scene } from "effect-motion";
import { describe, expect, it } from "vitest";
import { builtinRegistry } from "../src/Builtins.js";
import type { Leaf, Retained } from "../src/EntityRenderer.js";
import type { RenderException } from "../src/RenderException.js";
import * as Sync from "../src/Sync.js";
import { unreachable } from "./support/raise.js";

/** The RenderException message from a failed sync, for defect assertions. */
const failureMessage = (exit: Exit.Exit<void, RenderException>): string => {
	if (!Exit.isFailure(exit)) {
		return unreachable("expected a RenderException failure");
	}
	const reason = exit.cause.reasons.find((r) => r._tag === "Fail");
	return reason === undefined
		? unreachable("expected a Fail reason")
		: reason.error.message;
};

// Structural tests: frames sync into a retained THREE.Scene — assertions are
// on the retained graph (objects, transforms, materials), never on pixels
// (determinism stops at the frame stream; see AGENTS.md).

type AnyFrame = Parameters<typeof Sync.syncFrame>[1];

const framesOf = (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	settings: Record<string, unknown> = {},
): Promise<AnyFrame[]> =>
	Effect.runPromise(
		Scene.stream(
			Scene.make(make as never, { width: 500, height: 300 }) as never,
			settings,
		).pipe(Stream.runCollect) as unknown as Effect.Effect<
			Iterable<AnyFrame>,
			never,
			never
		>,
	).then((chunk) => [...chunk]);

const registry = () => builtinRegistry;

describe("coordinate mapping and the 2D identity invariant", () => {
	it("z=0 content under the untouched camera lands where authored", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 100, y: 50 }),
				radius: 7,
			});
			yield* Scene.tick;
		});
		const sync = Sync.make(registry());
		Effect.runSync(Sync.syncFrame(sync, frames.at(-1) ?? unreachable()));
		expect(ThreeScene.children(sync.scene)).toHaveLength(1);
		// a fill shape is a group (position/billboard) holding the fill mesh
		const group = ThreeScene.children(sync.scene)[0] ?? unreachable();
		// 500x300 viewport: origin shifts to center, y flips
		expect(group.position.x).toBe(100 - 250);
		expect(group.position.y).toBe(-(50 - 150));
		expect(group.position.z).toBe(0);
		const mesh = group.children[0] ?? unreachable();
		expect(mesh.scale.x).toBe(7);
	});

	it("the camera derives fov from the AE focal-length default", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate("Circle", {});
			yield* Scene.tick;
		});
		const sync = Sync.make(registry());
		Effect.runSync(Sync.syncFrame(sync, frames.at(-1) ?? unreachable()));
		const focal = (500 * 50) / 36;
		const expected = (2 * Math.atan(300 / (2 * focal)) * 180) / Math.PI;
		expect(sync.camera.fov).toBeCloseTo(expected, 10);
		expect(sync.camera.position.z).toBeGreaterThan(0);
	});

	it("frame metadata drives the background color", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate("Circle", {});
			yield* Scene.tick;
		});
		const frame = frames.at(-1) ?? unreachable();
		const withBg = {
			...frame,
			backgroundColor: Color.rgba(255, 0, 0, 1),
		} as AnyFrame;
		const sync = Sync.make(registry());
		Effect.runSync(Sync.syncFrame(sync, withBg));
		const bg = sync.scene["~three.scene"].background;
		expect(bg).not.toBeNull();
	});
});

describe("retained diff through the entity render contract", () => {
	// a custom entity registered through the same contract as built-ins —
	// its counters make create/update/dispose observable
	// The retained contract (create once / skip unchanged / update on change /
	// dispose on departure) is what this exercises. It used to define a custom
	// entity; the world is closed now, so it overrides the registry entry for
	// a real union member instead — the contract under test is unchanged.
	const PROBE_TAG = "Circle" as const;

	const makeProbeRenderer = () => {
		const counters = { builds: 0, updates: 0, disposes: 0 };
		const worlds: Array<{ x: number; y: number; z: number }> = [];
		const renderer = {
			build: (leaf: Leaf): Retained => {
				counters.builds++;
				worlds.push(leaf.world);
				return {
					object: new THREE.Object3D(),
					billboard: false,
					dispose: () => {
						counters.disposes++;
					},
				};
			},
			update: (_retained: Retained, leaf: Leaf) => {
				counters.updates++;
				worlds.push(leaf.world);
			},
		};
		return { counters, worlds, renderer };
	};

	const probeData = (
		frame: AnyFrame,
	): { position?: { x: number }; visible?: boolean } | undefined =>
		Object.values(frame.instances).find(
			(entry) => entry.data._tag === PROBE_TAG,
		)?.data as { position?: { x: number }; visible?: boolean } | undefined;

	it("creates once, skips unchanged frames, updates on change, disposes departed", async () => {
		const frames = await framesOf(function* () {
			const probe = yield* Scene.instantiate(PROBE_TAG, {
				position: S.vec3({ x: 1 }),
			});
			yield* Scene.tick; // frame A
			yield* Scene.update(probe, (data) => ({
				...data,
				position: S.vec3({ x: 2 }),
			}));
			yield* Scene.tick; // frame B (changed)
			yield* Scene.update(probe, (data) => ({ ...data, visible: false }));
			yield* Scene.tick; // frame C (hidden)
		});
		expect(frames.length).toBeGreaterThanOrEqual(3);
		const { counters, renderer } = makeProbeRenderer();
		const sync = Sync.make({
			...registry(),
			[PROBE_TAG]: renderer,
		});
		const a = frames[0] ?? unreachable();
		Effect.runSync(Sync.syncFrame(sync, a));
		expect(counters).toMatchObject({ builds: 1, updates: 0 });
		// identical frame: retained object untouched
		Effect.runSync(Sync.syncFrame(sync, a));
		expect(counters).toMatchObject({ builds: 1, updates: 0 });
		const b =
			frames.find((f) => probeData(f)?.position?.x === 2) ?? unreachable();
		Effect.runSync(Sync.syncFrame(sync, b));
		expect(counters).toMatchObject({ builds: 1, updates: 1 });
		const hidden =
			frames.find((f) => probeData(f)?.visible === false) ?? unreachable();
		Effect.runSync(Sync.syncFrame(sync, hidden));
		expect(counters).toMatchObject({ builds: 1, updates: 1, disposes: 1 });
		expect(ThreeScene.children(sync.scene)).toHaveLength(0);
	});

	it("group translation composes into the child's world position", async () => {
		const frames = await framesOf(function* () {
			const child = yield* Scene.instantiate(PROBE_TAG, {
				position: S.vec3({ x: 3, y: 4 }),
			});
			yield* Scene.instantiate("Group", {
				position: S.vec3({ x: 10, y: 20 }),
				children: [child],
			});
			yield* Scene.tick;
		});
		const { worlds, renderer } = makeProbeRenderer();
		const sync = Sync.make({ ...registry(), [PROBE_TAG]: renderer });
		Effect.runSync(Sync.syncFrame(sync, frames.at(-1) ?? unreachable()));
		expect(worlds.at(-1)).toEqual({ x: 13, y: 24, z: 0 });
	});

	// The "unregistered entity is a loud defect" test is gone: with the
	// registry exhaustive over the tag union, a missing renderer is a
	// COMPILE error, so the runtime path it covered is unreachable. The
	// guarantee is now asserted statically instead.
	it("the registry covers every entity tag", () => {
		const registered = new Set(Object.keys(registry()));
		for (const tag of Object.keys(S.EntityMap)) {
			expect(registered.has(tag)).toBe(true);
		}
	});
});

describe("line endpoints", () => {
	// regression: `start` AND `end` are both offsets from `position`. The
	// renderer once ignored `start` and treated `end` as absolute, so a box
	// wireframe whose edges carried their corners in start/end collapsed to
	// the origin. This asserts each endpoint lands at position + its offset.
	it("renders each endpoint at position + its own offset", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate("Line", {
				position: S.vec3({ x: 100, y: 50, z: 0 }),
				start: S.vec3({ x: 10, y: 5, z: 0 }),
				end: S.vec3({ x: 40, y: 20, z: 0 }),
			});
			yield* Scene.tick;
		});
		const sync = Sync.make(registry());
		Effect.runSync(Sync.syncFrame(sync, frames.at(-1) ?? unreachable()));
		const fatLine = ThreeScene.children(sync.scene)[0] ?? unreachable();
		const positions = (
			fatLine as unknown as {
				geometry: { attributes: { instanceStart: { array: Float32Array } } };
			}
		).geometry.attributes.instanceStart.array;
		// start endpoint: position + start = (110, 55) → three (x, -y)
		expect(positions[0]).toBeCloseTo(110 - 250, 4);
		expect(positions[1]).toBeCloseTo(-(55 - 150), 4);
		// end endpoint: position + end = (140, 70)
		expect(positions[3]).toBeCloseTo(140 - 250, 4);
		expect(positions[4]).toBeCloseTo(-(70 - 150), 4);
	});
});

describe("billboards and tilted planes", () => {
	it("a circle billboards: it carries the camera quaternion", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate("Circle", { position: S.vec3({ x: 10 }) });
			yield* Scene.tick;
		});
		const sync = Sync.make(registry());
		Effect.runSync(Sync.syncFrame(sync, frames.at(-1) ?? unreachable()));
		const mesh = ThreeScene.children(sync.scene)[0] ?? unreachable();
		expect(mesh.quaternion.equals(sync.camera.quaternion)).toBe(true);
	});

	it("a rect with rotY tilts instead of billboarding", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate("Rect", {
				rotation: S.vec3({ y: Math.PI / 4 }),
			});
			yield* Scene.tick;
		});
		const sync = Sync.make(registry());
		Effect.runSync(Sync.syncFrame(sync, frames.at(-1) ?? unreachable()));
		const mesh = ThreeScene.children(sync.scene)[0] ?? unreachable();
		expect(mesh.rotation.y).toBeCloseTo(Math.PI / 4, 10);
	});
});

describe("depth of field request", () => {
	it("aperture 0 (default) leaves the post chain structurally off", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate("Circle", {});
			yield* Scene.tick;
		});
		const sync = Sync.make(registry());
		Effect.runSync(Sync.syncFrame(sync, frames.at(-1) ?? unreachable()));
		expect(sync.dof.on).toBe(false);
	});

	it("aperture > 0 turns the per-pixel DoF on with camera-derived values", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate("Circle", {});
			yield* Scene.tick;
		});
		const frame = frames.at(-1) ?? unreachable();
		const withDof = {
			...frame,
			camera: { ...frame.camera, aperture: 2 },
		} as AnyFrame;
		const sync = Sync.make(registry());
		Effect.runSync(Sync.syncFrame(sync, withDof));
		expect(sync.dof.on).toBe(true);
		expect(sync.dof.strengthUv).toBeCloseTo((2 * 2) / 300, 10);
		expect(sync.dof.focusDistance).toBe(frame.camera.focusDistance);
	});
});

describe("screen-space HUD tier", () => {
	it("a Hud subtree routes to the hud scene with identity billboarding", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate("Circle", { position: S.vec3({ x: 10 }) });
			const pinned = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 20 }),
			});
			yield* Scene.instantiate("Hud", { children: [pinned] });
			yield* Scene.tick;
		});
		const sync = Sync.make(registry());
		Effect.runSync(Sync.syncFrame(sync, frames.at(-1) ?? unreachable()));
		expect(ThreeScene.children(sync.scene)).toHaveLength(1);
		expect(ThreeScene.children(sync.hudScene)).toHaveLength(1);
		// hud billboards face the identity camera, not the world camera
		const hudObject = ThreeScene.children(sync.hudScene)[0] ?? unreachable();
		expect(hudObject.quaternion.equals(sync.hudCamera.quaternion)).toBe(true);
	});
});

describe("mounted-scene sub-compositions", () => {
	// A comp is DECLARED by Scene.play now, not inferred from a group that
	// happens to carry a size (design D13). The frame's `comps` registry is
	// what makes a subtree a render-to-texture boundary.
	it("a mounted scene becomes a comp: nested sync + textured plane", async () => {
		const innerScene = Scene.make(
			function* () {
				yield* Scene.instantiate("Circle", {
					position: S.vec3({ x: 30, y: 20 }),
				});
				yield* Scene.tick;
			} as never,
			{ width: 100, height: 80 },
		);
		const frames = await framesOf(function* () {
			const h = yield* Scene.play(innerScene as never);
			yield* h.finished;
		});
		const sync = Sync.make(registry());
		Effect.runSync(Sync.syncFrame(sync, frames.at(-1) ?? unreachable()));
		expect(sync.comps.size).toBe(1);
		const comp = [...sync.comps.values()][0] ?? unreachable();
		// the comp's subtree syncs into its own scene, comp-local
		expect(ThreeScene.children(comp.sync.scene)).toHaveLength(1);
		const inner = ThreeScene.children(comp.sync.scene)[0] ?? unreachable();
		// comp-local coords: the child sits at its own (x, y) within 100x80
		expect(inner.position.x).toBe(30 - 50);
		expect(inner.position.y).toBe(-(20 - 40));
		// Scene.play centers the child comp in the movie: (500-100)/2 = 200,
		// (300-80)/2 = 110 — the mount group's world anchor
		expect(comp.holder.position.x).toBe(200 - 250);
		expect(comp.holder.position.y).toBe(-(110 - 150));
		expect(comp.plane.scale.x).toBe(100);
		expect(comp.plane.scale.y).toBe(80);
	});
});

describe("traversal defects (hand-built frames)", () => {
	const frameOf = (
		instances: AnyFrame["instances"],
		rootChildren: ReadonlyArray<string>,
	): AnyFrame =>
		({
			instances: {
				...instances,
				root: { data: S.Group.make({ children: rootChildren }) },
			},
			root: "root",
			frameRate: 60,
			width: 500,
			height: 300,
			backgroundColor: Color.hex("#16161d"),
			camera: Runner.identityCameraView(500),
			comps: {},
		}) as AnyFrame;

	const group = (children: ReadonlyArray<string>) => ({
		data: S.Group.make({ children }),
		entity: S.Group,
	});
	const circle = { data: S.Circle.make({}), entity: S.Circle };

	it("duplicate reference dies naming the id", () => {
		const frame = frameOf(
			{ g1: group(["c1"]), g2: group(["c1"]), c1: circle },
			["g1", "g2"],
		);
		const sync = Sync.make(registry());
		const exit = Effect.runSyncExit(Sync.syncFrame(sync, frame));
		expect(exit._tag).toBe("Failure");
		expect(failureMessage(exit)).toMatch(/"c1" is referenced more than once/);
	});

	it("cycle dies as a duplicate reference", () => {
		const frame = frameOf({ g1: group(["g2"]), g2: group(["g1"]) }, ["g1"]);
		const sync = Sync.make(registry());
		const exit = Effect.runSyncExit(Sync.syncFrame(sync, frame));
		expect(exit._tag).toBe("Failure");
		expect(failureMessage(exit)).toMatch(/referenced more than once/);
	});

	it("dangling reference dies naming the id", () => {
		const frame = frameOf({ g1: group(["ghost"]) }, ["g1"]);
		const sync = Sync.make(registry());
		const exit = Effect.runSyncExit(Sync.syncFrame(sync, frame));
		expect(exit._tag).toBe("Failure");
		expect(failureMessage(exit)).toMatch(/unknown instance id "ghost"/);
	});
});
