import * as Effect from "effect/Effect";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as THREE from "three/webgpu";
import { describe, expect, it } from "vitest";
import { builtinRegistry, builtinRenderers } from "../src/Builtins.js";
import * as Stroke from "../src/Stroke.js";
import * as Sync from "../src/Sync.js";
import { unreachable } from "./support/raise.js";

const points = [
	{ x: -30, y: -20, z: 0 },
	{ x: 30, y: -20, z: 0 },
	{ x: 0, y: 30, z: 0 },
];
const paths = [{ points, closed: true }];

describe("one planar stroke", () => {
	it("classifies every subpath's defining depth", () => {
		expect(Stroke.planar(paths)).toBe(true);
		expect(
			Stroke.planar([
				...paths,
				{ points: [{ x: 0, y: 0, z: 1 }], closed: false },
			]),
		).toBe(false);
		expect(
			Stroke.planar([
				{ points: points.map((point) => ({ ...point, z: 12 })), closed: false },
			]),
		).toBe(true);
	});
	it("retains occupancy across color/opacity edits, rebuilds on width and geometry", () => {
		const stroke = Stroke.make();
		Stroke.update(stroke, paths, 10, Color.white, 1);
		const geometry = stroke.occupancy.geometry;
		for (const opacity of [0, 0.25, 0.5, 0.75, 1])
			Stroke.update(stroke, paths, 10, Color.rgba(255, 0, 0, 0.5), opacity);
		expect(stroke.occupancy.geometry).toBe(geometry);
		expect(stroke.stats.geometryBuilds).toBe(1);
		expect(stroke.object.material.opacity).toBeCloseTo(0.5, 2);
		expect(stroke.occupancy.material.blending).toBe(THREE.NoBlending);
		expect(stroke.occupancy.material.depthTest).toBe(false);
		expect(stroke.object.material.alphaTest).toBeGreaterThan(0);
		Stroke.update(stroke, paths, 20, Color.white, 1);
		expect(stroke.occupancy.geometry).not.toBe(geometry);
		Stroke.update(
			stroke,
			[{ points: points.slice(0, 2), closed: false }],
			20,
			Color.white,
			1,
		);
		expect(stroke.stats.geometryBuilds).toBe(3);
		Stroke.dispose(stroke);
	});
	it("joins closure without adding another endpoint and preserves zero-length round caps", () => {
		const open = Stroke.silhouette([{ points, closed: false }], 10);
		const closed = Stroke.silhouette(paths, 10);
		// Closure adds one segment body (two triangles), not a second cap.
		expect(closed.length - open.length).toBe(18);
		expect(
			Stroke.silhouette([{ points: [{ x: 2, y: 3, z: 0 }], closed: false }], 10)
				.length,
		).toBeGreaterThan(0);
		expect(Stroke.silhouette(paths, 0)).toHaveLength(0);
	});
	it("keeps a nonplanar line's per-point depth when changing eligibility", () => {
		const sync = Sync.make(builtinRegistry);
		const renderer = builtinRenderers.Line;
		const leaf = {
			id: "line",
			world: { x: 100, y: 50, z: 10 },
			transform: {
				matrix: new THREE.Matrix4().makeTranslation(100, 50, 10),
				quaternion: new THREE.Quaternion(),
				scale: new THREE.Vector3(1, 1, 1),
				rotated: false,
			},
			data: Entity.Line.make({
				start: Entity.vec3({ x: 10, z: -20 }),
				end: Entity.vec3({ x: 40, z: 30 }),
			}),
		};
		const retained = renderer.build(leaf, sync.ctx);
		const spatial = retained.object.children[1];
		if (!(spatial instanceof THREE.Mesh)) return unreachable();
		expect(spatial.visible).toBe(true);
		const start = spatial.geometry.getAttribute("instanceStart");
		const end = spatial.geometry.getAttribute("instanceEnd");
		expect(start.getZ(0)).toBe(-20);
		expect(end.getZ(0)).toBe(30);
		expect(
			new THREE.Vector3().setFromMatrixPosition(retained.object.matrix).z,
		).toBe(10);
		renderer.update(
			retained,
			{
				...leaf,
				data: Entity.Line.make({
					start: Entity.vec3({ x: 10 }),
					end: Entity.vec3({ x: 40 }),
				}),
			},
			sync.ctx,
		);
		expect(spatial.visible).toBe(false);
		expect(retained.object.children[0]?.visible).toBe(true);
		retained.dispose();
		Effect.runSync(Sync.dispose(sync));
	});
});
