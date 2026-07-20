import { THREE } from "@effect-motion/three";
import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { Camera, Color, Entity, Scene, Shapes } from "effect-motion";
import { describe, expect, it } from "vitest";
import { builtinRegistry } from "../src/Builtins.js";
import type { Leaf, Retained } from "../src/EntityRenderer.js";
import * as Sync from "../src/Sync.js";
import { unreachable } from "./support/raise.js";

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
			yield* Scene.instantiate(Shapes.Circle, { x: 100, y: 50, radius: 7 });
			yield* Scene.tick;
		});
		const sync = Sync.make(registry());
		Sync.syncFrame(sync, frames.at(-1) ?? unreachable());
		expect(sync.scene.children).toHaveLength(1);
		// a fill shape is a group (position/billboard) holding the fill mesh
		const group = sync.scene.children[0] ?? unreachable();
		// 500x300 viewport: origin shifts to center, y flips
		expect(group.position.x).toBe(100 - 250);
		expect(group.position.y).toBe(-(50 - 150));
		expect(group.position.z).toBe(0);
		const mesh = group.children[0] ?? unreachable();
		expect(mesh.scale.x).toBe(7);
	});

	it("the camera derives fov from the AE focal-length default", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate(Shapes.Circle, {});
			yield* Scene.tick;
		});
		const sync = Sync.make(registry());
		Sync.syncFrame(sync, frames.at(-1) ?? unreachable());
		const focal = (500 * 50) / 36;
		const expected = (2 * Math.atan(300 / (2 * focal)) * 180) / Math.PI;
		expect(sync.camera.fov).toBeCloseTo(expected, 10);
		expect(sync.camera.position.z).toBeGreaterThan(0);
	});

	it("frame metadata drives the background color", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate(Shapes.Circle, {});
			yield* Scene.tick;
		});
		const frame = frames.at(-1) ?? unreachable();
		const withBg = {
			...frame,
			backgroundColor: Color.rgba(255, 0, 0, 1),
		} as AnyFrame;
		const sync = Sync.make(registry());
		Sync.syncFrame(sync, withBg);
		const bg = sync.scene.background;
		expect(bg).not.toBeNull();
	});
});

describe("retained diff through the entity render contract", () => {
	// a custom entity registered through the same contract as built-ins —
	// its counters make create/update/dispose observable
	const Probe = Entity.make("test/Probe", { ...Shapes.Shape2D.position }, {});

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
	): { x?: number; "~visible"?: boolean } | undefined =>
		Object.values(frame.instances).find(
			(entry) => entry.entity.name === "test/Probe",
		)?.data as { x?: number; "~visible"?: boolean } | undefined;

	it("creates once, skips unchanged frames, updates on change, disposes departed", async () => {
		const frames = await framesOf(function* () {
			const probe = yield* Scene.instantiate(Probe, { x: 1 });
			yield* Scene.tick; // frame A
			yield* Scene.update(probe, (data) => ({ ...data, x: 2 }));
			yield* Scene.tick; // frame B (changed)
			yield* Scene.update(probe, (data) => ({ ...data, "~visible": false }));
			yield* Scene.tick; // frame C (hidden)
		});
		expect(frames.length).toBeGreaterThanOrEqual(3);
		const { counters, renderer } = makeProbeRenderer();
		const sync = Sync.make({
			...registry(),
			"test/Probe": renderer,
		});
		const a = frames[0] ?? unreachable();
		Sync.syncFrame(sync, a);
		expect(counters).toMatchObject({ builds: 1, updates: 0 });
		Sync.syncFrame(sync, a); // identical frame: retained object untouched
		expect(counters).toMatchObject({ builds: 1, updates: 0 });
		const b = frames.find((f) => probeData(f)?.x === 2) ?? unreachable();
		Sync.syncFrame(sync, b);
		expect(counters).toMatchObject({ builds: 1, updates: 1 });
		const hidden =
			frames.find((f) => probeData(f)?.["~visible"] === false) ?? unreachable();
		Sync.syncFrame(sync, hidden);
		expect(counters).toMatchObject({ builds: 1, updates: 1, disposes: 1 });
		expect(sync.scene.children).toHaveLength(0);
	});

	it("group translation composes into the child's world position", async () => {
		const frames = await framesOf(function* () {
			const child = yield* Scene.instantiate(Probe, { x: 3, y: 4 });
			yield* Scene.instantiate(Shapes.Group, {
				x: 10,
				y: 20,
				children: [child],
			});
			yield* Scene.tick;
		});
		const { worlds, renderer } = makeProbeRenderer();
		const sync = Sync.make({ ...registry(), "test/Probe": renderer });
		Sync.syncFrame(sync, frames.at(-1) ?? unreachable());
		expect(worlds.at(-1)).toEqual({ x: 13, y: 24, z: 0 });
	});

	it("an unregistered entity is a loud defect naming it", async () => {
		const Unknown = Entity.make(
			"test/Unregistered",
			{ ...Shapes.Shape2D.position },
			{},
		);
		const frames = await framesOf(function* () {
			yield* Scene.instantiate(Unknown, {});
			yield* Scene.tick;
		});
		const sync = Sync.make(registry());
		expect(() => Sync.syncFrame(sync, frames.at(-1) ?? unreachable())).toThrow(
			/test\/Unregistered/,
		);
	});
});

describe("billboards and tilted planes", () => {
	it("a circle billboards: it carries the camera quaternion", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 10 });
			yield* Scene.tick;
		});
		const sync = Sync.make(registry());
		Sync.syncFrame(sync, frames.at(-1) ?? unreachable());
		const mesh = sync.scene.children[0] ?? unreachable();
		expect(mesh.quaternion.equals(sync.camera.quaternion)).toBe(true);
	});

	it("a rect with rotY tilts instead of billboarding", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate(Shapes.Rect, { rotY: Math.PI / 4 });
			yield* Scene.tick;
		});
		const sync = Sync.make(registry());
		Sync.syncFrame(sync, frames.at(-1) ?? unreachable());
		const mesh = sync.scene.children[0] ?? unreachable();
		expect(mesh.rotation.y).toBeCloseTo(Math.PI / 4, 10);
	});
});

describe("depth of field request", () => {
	it("aperture 0 (default) leaves the post chain structurally off", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate(Shapes.Circle, {});
			yield* Scene.tick;
		});
		const sync = Sync.make(registry());
		Sync.syncFrame(sync, frames.at(-1) ?? unreachable());
		expect(sync.dof.on).toBe(false);
	});

	it("aperture > 0 turns the per-pixel DoF on with camera-derived values", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate(Shapes.Circle, {});
			yield* Scene.tick;
		});
		const frame = frames.at(-1) ?? unreachable();
		const withDof = {
			...frame,
			camera: { ...frame.camera, aperture: 2 },
		} as AnyFrame;
		const sync = Sync.make(registry());
		Sync.syncFrame(sync, withDof);
		expect(sync.dof.on).toBe(true);
		expect(sync.dof.strengthUv).toBeCloseTo((2 * 2) / 300, 10);
		expect(sync.dof.focusDistance).toBe(frame.camera.focusDistance);
	});
});

describe("screen-space HUD tier", () => {
	it("a Hud subtree routes to the hud scene with identity billboarding", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 10 });
			const pinned = yield* Scene.instantiate(Shapes.Circle, { x: 20 });
			yield* Scene.instantiate(Shapes.Hud, { children: [pinned] });
			yield* Scene.tick;
		});
		const sync = Sync.make(registry());
		Sync.syncFrame(sync, frames.at(-1) ?? unreachable());
		expect(sync.scene.children).toHaveLength(1);
		expect(sync.hudScene.children).toHaveLength(1);
		// hud billboards face the identity camera, not the world camera
		const hudObject = sync.hudScene.children[0] ?? unreachable();
		expect(hudObject.quaternion.equals(sync.hudCamera.quaternion)).toBe(true);
	});
});

describe("sized-group sub-compositions", () => {
	it("a sized group becomes a comp: nested sync + textured plane", async () => {
		const frames = await framesOf(function* () {
			const child = yield* Scene.instantiate(Shapes.Circle, { x: 30, y: 20 });
			yield* Scene.instantiate(Shapes.Group, {
				x: 40,
				y: 10,
				width: 100,
				height: 80,
				children: [child],
			});
			yield* Scene.tick;
		});
		const sync = Sync.make(registry());
		Sync.syncFrame(sync, frames.at(-1) ?? unreachable());
		expect(sync.comps.size).toBe(1);
		const comp = [...sync.comps.values()][0] ?? unreachable();
		// the comp's subtree syncs into its own scene, comp-local
		expect(comp.sync.scene.children).toHaveLength(1);
		const inner = comp.sync.scene.children[0] ?? unreachable();
		// comp-local coords: the child sits at its own (x, y) within 100x80
		expect(inner.position.x).toBe(30 - 50);
		expect(inner.position.y).toBe(-(20 - 40));
		// the composite plane sits at the group's world anchor
		expect(comp.holder.position.x).toBe(40 - 250);
		expect(comp.holder.position.y).toBe(-(10 - 150));
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
				root: {
					data: Shapes.Group.data.make({ children: rootChildren }),
					entity: Shapes.Group,
				},
			},
			root: "root",
			frameRate: 60,
			width: 500,
			height: 300,
			backgroundColor: Color.hex("#16161d"),
			camera: Camera.identity(500),
		}) as AnyFrame;

	const group = (children: ReadonlyArray<string>) => ({
		data: Shapes.Group.data.make({ children }),
		entity: Shapes.Group,
	});
	const circle = { data: Shapes.Circle.data.make({}), entity: Shapes.Circle };

	it("duplicate reference dies naming the id", () => {
		const frame = frameOf(
			{ g1: group(["c1"]), g2: group(["c1"]), c1: circle },
			["g1", "g2"],
		);
		const sync = Sync.make(registry());
		expect(() => Sync.syncFrame(sync, frame)).toThrow(
			/"c1" is referenced more than once/,
		);
	});

	it("cycle dies as a duplicate reference", () => {
		const frame = frameOf({ g1: group(["g2"]), g2: group(["g1"]) }, ["g1"]);
		const sync = Sync.make(registry());
		expect(() => Sync.syncFrame(sync, frame)).toThrow(
			/referenced more than once/,
		);
	});

	it("dangling reference dies naming the id", () => {
		const frame = frameOf({ g1: group(["ghost"]) }, ["g1"]);
		const sync = Sync.make(registry());
		expect(() => Sync.syncFrame(sync, frame)).toThrow(
			/unknown instance id "ghost"/,
		);
	});
});
