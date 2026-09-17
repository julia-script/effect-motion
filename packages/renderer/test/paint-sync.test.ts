import * as Effect from "effect/Effect";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Runner from "effect-motion/Runner";
import type * as Scene from "effect-motion/Scene";
import * as THREE from "three/webgpu";
import { describe, expect, it } from "vitest";
import { builtinRegistry } from "../src/Builtins.js";
import type { Leaf } from "../src/EntityRenderer.js";
import * as Sync from "../src/Sync.js";
import { unreachable } from "./support/raise.js";

const frame = (
	instances: Scene.Frame["instances"],
	children: ReadonlyArray<string>,
	compositing: Runner.Compositing = "paint",
): Scene.Frame => ({
	instances: { ...instances, root: { data: Entity.Group.make({ children }) } },
	root: "root",
	frameRate: 60,
	width: 500,
	height: 300,
	compositing,
	backgroundColor: Color.transparent,
	camera: Runner.identityCameraView(500),
	comps: {},
});
const rect = (props: Parameters<typeof Entity.Rect.make>[0] = {}) => ({
	data: Entity.Rect.make({ width: 50, height: 30, ...props }),
});
const mesh = (sync: Sync.Sync, id: string) => {
	const result = sync.retained.get(id)?.retained.object.children[0];
	return result instanceof THREE.Mesh ? result : unreachable();
};
const material = (m: THREE.Mesh) =>
	Array.isArray(m.material) ? (m.material[0] ?? unreachable()) : m.material;
const apply = (sync: Sync.Sync, f: Scene.Frame) =>
	Effect.runSync(Sync.syncFrame(sync, f));

describe("paint contexts", () => {
	it("reorders retained geometry and keeps fill/stroke draws together", () => {
		const sync = Sync.make(builtinRegistry);
		const instances = { a: rect(), b: rect() };
		apply(sync, frame(instances, ["a", "b"]));
		const a = mesh(sync, "a"),
			b = mesh(sync, "b");
		const geometry = a.geometry;
		expect(a.renderOrder).toBeLessThan(b.renderOrder);
		expect(material(a).depthTest).toBe(false);
		expect(material(a).depthWrite).toBe(false);
		apply(sync, frame(instances, ["b", "a"]));
		expect(mesh(sync, "a")).toBe(a);
		expect(a.geometry).toBe(geometry);
		expect(a.renderOrder).toBeGreaterThan(b.renderOrder);
		apply(sync, frame(instances, ["b", "a"], "depth"));
		expect(material(a).depthTest).toBe(true);
	});
	it("keeps opaque custom materials in the paint queue through fades", () => {
		const sync = Sync.make({
			...builtinRegistry,
			Rect: {
				build: () => ({
					object: new THREE.Mesh(
						new THREE.PlaneGeometry(10, 10),
						new THREE.MeshBasicNodeMaterial(),
					),
					billboard: false,
					dispose: () => {},
				}),
				update: (retained, leaf: Leaf<Entity.EntityByTag<"Rect">>) => {
					if (retained.object instanceof THREE.Mesh)
						material(retained.object).opacity = leaf.data.opacity;
				},
			},
		});
		for (const opacity of [0, 0.5, 1]) {
			apply(sync, frame({ a: rect({ opacity }) }, ["a"]));
			const object = sync.retained.get("a")?.retained.object;
			if (!(object instanceof THREE.Mesh)) return unreachable();
			expect(material(object).transparent).toBe(true);
			expect(material(object).depthTest).toBe(false);
		}
	});
	it("isolates bounds, transforms, opacity and resources, then releases a departed group", async () => {
		const sync = Sync.make(builtinRegistry);
		const f = frame(
			{
				g: {
					data: Entity.Group.make({
						children: ["a"],
						compositing: "paint",
						opacity: 0.5,
						position: Entity.vec3({ x: 100 }),
						rotation: Entity.vec3({ y: 0.3 }),
						scale: Entity.vec3({ x: 2, y: 2, z: 1 }),
					}),
				},
				a: rect({ position: Entity.vec3({ x: -40.25 }), strokeWidth: 20 }),
			},
			["g"],
			"depth",
		);
		apply(sync, f);
		await Effect.runPromise(Sync.whenReady(sync));
		const comp = sync.comps.get("g") ?? unreachable();
		expect(comp.sync.text).toBe(sync.text);
		expect(comp.width).toBeGreaterThanOrEqual(70);
		expect(comp.plane.position.x).toBeCloseTo(-40.25);
		expect(comp.holder.position.x).toBe(100);
		expect(comp.transformHolder.rotation.y).toBe(0.3);
		expect(comp.transformHolder.scale.x).toBe(2);
		expect(comp.material.opacity).toBe(0.5);
		expect(comp.material.alphaTest).toBeGreaterThan(0);
		expect(material(mesh(comp.sync, "a")).depthTest).toBe(false);
		let disposed = false;
		comp.material.addEventListener("dispose", () => {
			disposed = true;
		});
		apply(sync, frame({}, []));
		await Effect.runPromise(Sync.whenReady(sync));
		expect(sync.comps.size).toBe(0);
		expect(disposed).toBe(true);
	});
});

describe("paint context lifetime", () => {
	it("reuses nested contexts, updates fractional bounds, and removes stale descendants", async () => {
		const sync = Sync.make(builtinRegistry);
		let first: Sync.CompState | undefined;
		for (let i = 0; i < 30; i++) {
			apply(
				sync,
				frame(
					{
						outer: {
							data: Entity.Group.make({
								compositing: "paint",
								children: ["inner"],
							}),
						},
						inner: {
							data: Entity.Group.make({
								compositing: "paint",
								children: ["a"],
							}),
						},
						a: rect({
							position: Entity.vec3({ x: -70.25 + i / 4 }),
							width: 50 + i,
						}),
					},
					["outer"],
				),
			);
			await Effect.runPromise(Sync.whenReady(sync));
			const outer = sync.comps.get("outer") ?? unreachable();
			first ??= outer;
			expect(outer).toBe(first);
			expect(sync.comps.size).toBe(1);
			expect(outer.sync.comps.size).toBe(1);
			const inner = outer.sync.comps.get("inner") ?? unreachable();
			expect(inner.plane.position.x).toBeCloseTo(-70.25 + i / 4);
		}
		apply(
			sync,
			frame(
				{ outer: { data: Entity.Group.make({ compositing: "inherit" }) } },
				["outer"],
			),
		);
		await Effect.runPromise(Sync.whenReady(sync));
		expect(sync.comps.size).toBe(0);
		expect(first?.sync.comps.size).toBe(0);
		apply(
			sync,
			frame({ outer: { data: Entity.Group.make({ compositing: "paint" }) } }, [
				"outer",
			]),
		);
		expect(sync.comps.get("outer")?.holder.visible).toBe(false);
		await Effect.runPromise(Sync.dispose(sync));
	});
	it("detects cycles across paint boundaries", async () => {
		const sync = Sync.make(builtinRegistry);
		const exit = await Effect.runPromiseExit(
			Sync.syncFrame(
				sync,
				frame(
					{
						g: {
							data: Entity.Group.make({
								compositing: "paint",
								children: ["g"],
							}),
						},
					},
					["g"],
				),
			),
		);
		expect(exit._tag).toBe("Failure");
	});
});
