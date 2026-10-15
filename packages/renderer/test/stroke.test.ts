import * as Effect from "effect/Effect";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as THREE from "three/webgpu";
import { describe, expect, it } from "vitest";
import { builtinRegistry, builtinRenderers } from "../src/Builtins.js";
import type { EntityRenderer } from "../src/EntityRenderer.js";
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
		const spatialGroup = retained.object.children[1] ?? unreachable();
		const spatial = spatialGroup.children[0];
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
		expect(spatialGroup.visible).toBe(false);
		expect(retained.object.children[0]?.visible).toBe(true);
		retained.dispose();
		Effect.runSync(Sync.dispose(sync));
	});
});

const leafOf = <A>(data: A) => ({
	id: "shape",
	data,
	world: { x: 0, y: 0, z: 0 },
	transform: {
		matrix: new THREE.Matrix4(),
		quaternion: new THREE.Quaternion(),
		scale: new THREE.Vector3(1, 1, 1),
		rotated: false,
	},
});
const strokeOf = (object: THREE.Object3D): Stroke.Stroke => {
	let result: Stroke.Stroke | undefined;
	object.traverse((child) => {
		result ??= Stroke.fromObject(child);
	});
	return result ?? unreachable();
};
const spatialMeshes = (object: THREE.Object3D): Array<THREE.Mesh> =>
	object.children.filter(
		(child): child is THREE.Mesh => child instanceof THREE.Mesh,
	);

const exerciseOutline = <
	A extends Entity.EntityByTag<"Rect" | "Circle" | "Ellipse">,
>(
	renderer: EntityRenderer<A>,
	data: A,
) => {
	const sync = Sync.make(builtinRegistry);
	const retained = renderer.build(leafOf(data), sync.ctx);
	const fill = retained.object.children[0];
	if (!(fill instanceof THREE.Mesh)) return unreachable();
	const fillGeometry = fill.geometry;
	const stroke = strokeOf(retained.object);
	const solid = stroke.occupancy.geometry;
	renderer.update(
		retained,
		leafOf({ ...data, strokeDasharray: [10, 15] }),
		sync.ctx,
	);
	expect(stroke.occupancy.geometry).not.toBe(solid);
	const dashed = stroke.occupancy.geometry;
	renderer.update(
		retained,
		leafOf({ ...data, strokeDasharray: [10, 15], strokeDashoffset: 5 }),
		sync.ctx,
	);
	expect(stroke.occupancy.geometry).not.toBe(dashed);
	renderer.update(retained, leafOf({ ...data, trimEnd: 0 }), sync.ctx);
	expect(stroke.object.visible).toBe(false);
	expect(fill.visible).toBe(true);
	expect(fill.geometry).toBe(fillGeometry);
	retained.dispose();
	Effect.runSync(Sync.dispose(sync));
};

// Pure interval tests cannot catch an omitted renderer field, accidental fill
// clipping, stale retained geometry, or a spatial branch choosing the trimmed
// depth rather than the original geometry. These exercise the real manifest.
describe("stroke controls through retained renderers", () => {
	it("wires Rect outline trim/dashes without changing its fill", () => {
		exerciseOutline(
			builtinRenderers.Rect,
			Entity.Rect.make({ strokeColor: Color.black, strokeWidth: 2 }),
		);
	});
	it("wires Circle outline trim/dashes without changing its fill", () => {
		exerciseOutline(
			builtinRenderers.Circle,
			Entity.Circle.make({ strokeColor: Color.black, strokeWidth: 2 }),
		);
	});
	it("wires Ellipse outline trim/dashes without changing its fill", () => {
		exerciseOutline(
			builtinRenderers.Ellipse,
			Entity.Ellipse.make({ strokeColor: Color.black, strokeWidth: 2 }),
		);
	});

	it("clips only a closed Path's stroke and retains fill and paint-only geometry", () => {
		const sync = Sync.make(builtinRegistry);
		const renderer = builtinRenderers.Path;
		const data = Entity.Path.make({
			commands: [
				{ _tag: "M", x: 0, y: 0 },
				{ _tag: "H", x: 100 },
				{ _tag: "V", y: 100 },
				{ _tag: "H", x: 0 },
				{ _tag: "Z" },
			],
			strokeColor: Color.black,
			strokeWidth: 2,
		});
		const retained = renderer.build(leafOf(data), sync.ctx);
		const fill = retained.object.children[0]?.children[0];
		if (!(fill instanceof THREE.Mesh)) return unreachable();
		const fillGeometry = fill.geometry;
		const stroke = strokeOf(retained.object);
		const clipped = { ...data, trimEnd: 0.25, strokeDasharray: [10, 10] };
		renderer.update(retained, leafOf(clipped), sync.ctx);
		const box = stroke.occupancy.geometry.boundingBox ?? unreachable();
		expect(box.min.x).toBeCloseTo(-1);
		expect(box.max.x).toBeCloseTo(91);
		expect(box.max.y).toBeCloseTo(1);
		const geometry = stroke.occupancy.geometry;
		renderer.update(
			retained,
			leafOf({ ...clipped, opacity: 0.5, strokeColor: Color.white }),
			sync.ctx,
		);
		expect(stroke.occupancy.geometry).toBe(geometry);
		expect(stroke.object.material.opacity).toBe(0.5);
		renderer.update(
			retained,
			leafOf({ ...clipped, strokeDashoffset: 10 }),
			sync.ctx,
		);
		const shifted = stroke.occupancy.geometry.boundingBox ?? unreachable();
		expect(shifted.min.x).toBeCloseTo(9);
		expect(shifted.max.x).toBeCloseTo(101);
		renderer.update(retained, leafOf({ ...data, trimEnd: 0 }), sync.ctx);
		expect(stroke.object.visible).toBe(false);
		expect(fill.geometry).toBe(fillGeometry);
		expect(fill.visible).toBe(true);
		retained.dispose();
		Effect.runSync(Sync.dispose(sync));
	});

	it("updates spatial fragments, interpolates depth, reuses color-only geometry and disposes replacements", () => {
		const sync = Sync.make(builtinRegistry);
		const renderer = builtinRenderers.Line;
		const data = Entity.Line.make({
			end: Entity.vec3({ x: 100, z: 100 }),
			trimEnd: 0.5,
			strokeDasharray: [10 * Math.SQRT2, 10 * Math.SQRT2],
		});
		const retained = renderer.build(leafOf(data), sync.ctx);
		const group = retained.object.children[1] ?? unreachable();
		const fragments = spatialMeshes(group);
		expect(fragments).toHaveLength(3);
		const first = fragments[0] ?? unreachable();
		const last = fragments.at(-1) ?? unreachable();
		expect(first.geometry.getAttribute("instanceStart").getZ(0)).toBeCloseTo(0);
		expect(last.geometry.getAttribute("instanceEnd").getZ(0)).toBeCloseTo(50);
		const geometry = first.geometry;
		renderer.update(retained, leafOf({ ...data, opacity: 0.5 }), sync.ctx);
		expect(group.children[0]).toBe(first);
		expect(first.geometry).toBe(geometry);
		let disposedGeometry = false;
		let disposedMaterial = false;
		geometry.addEventListener("dispose", () => {
			disposedGeometry = true;
		});
		const material = Array.isArray(first.material)
			? (first.material[0] ?? unreachable())
			: first.material;
		material.addEventListener("dispose", () => {
			disposedMaterial = true;
		});
		renderer.update(retained, leafOf({ ...data, trimStart: 0.25 }), sync.ctx);
		const trimmed = spatialMeshes(group)[0] ?? unreachable();
		expect(trimmed.geometry.getAttribute("instanceStart").getX(0)).toBeCloseTo(
			25,
		);
		expect(trimmed.geometry.getAttribute("instanceStart").getZ(0)).toBeCloseTo(
			25,
		);
		expect(disposedGeometry).toBe(true);
		expect(disposedMaterial).toBe(true);
		let finalDisposed = false;
		trimmed.geometry.addEventListener("dispose", () => {
			finalDisposed = true;
		});
		retained.dispose();
		expect(finalDisposed).toBe(true);
		Effect.runSync(Sync.dispose(sync));
	});

	it("renders spatial dash dots as finite round geometry with world-unit width", () => {
		const sync = Sync.make(builtinRegistry);
		const renderer = builtinRenderers.Line;
		const data = Entity.Line.make({
			end: Entity.vec3({ x: 100, z: 100 }),
			strokeWidth: 6,
			strokeDasharray: [0, 20 * Math.SQRT2],
		});
		const retained = renderer.build(leafOf(data), sync.ctx);
		const dots = spatialMeshes(retained.object.children[1] ?? unreachable());
		expect(dots.length).toBeGreaterThan(1);
		const dot = dots[1] ?? unreachable();
		expect(dot.position.x).toBeCloseTo(20);
		expect(dot.position.z).toBeCloseTo(20);
		dot.geometry.computeBoundingBox();
		const box = dot.geometry.boundingBox ?? unreachable();
		expect((box.max.x - box.min.x) * dot.scale.x).toBeCloseTo(6);
		expect(
			Array.from(dot.geometry.getAttribute("position").array).every(
				Number.isFinite,
			),
		).toBe(true);
		retained.dispose();
		Effect.runSync(Sync.dispose(sync));
	});

	it("closes a spatial contour without feeding a duplicate endpoint to fat-line shaders", () => {
		const sync = Sync.make(builtinRegistry);
		const renderer = builtinRenderers.Path;
		const data = Entity.Path.make({
			commands: [
				{ _tag: "M", x: 0, y: 0 },
				{ _tag: "L", x: 100, y: 0, z: 10 },
				{ _tag: "L", x: 0, y: 100 },
				{ _tag: "L", x: 0, y: 0 },
				{ _tag: "Z" },
			],
			strokeColor: Color.black,
		});
		const retained = renderer.build(leafOf(data), sync.ctx);
		const geometry =
			spatialMeshes(retained.object.children[2] ?? unreachable())[0]
				?.geometry ?? unreachable();
		const starts = geometry.getAttribute("instanceStart");
		const ends = geometry.getAttribute("instanceEnd");
		expect(starts.count).toBe(3);
		for (let i = 0; i < starts.count; i++) {
			expect(
				Math.hypot(
					starts.getX(i) - ends.getX(i),
					starts.getY(i) - ends.getY(i),
					starts.getZ(i) - ends.getZ(i),
				),
			).toBeGreaterThan(0);
		}
		retained.dispose();
		Effect.runSync(Sync.dispose(sync));
	});

	it("keeps original Path depth eligibility after trim hides another depth plane", () => {
		const sync = Sync.make(builtinRegistry);
		const renderer = builtinRenderers.Path;
		const data = Entity.Path.make({
			commands: [
				{ _tag: "M", x: 0, y: 0 },
				{ _tag: "L", x: 100, y: 0 },
				{ _tag: "M", x: 0, y: 0, z: 100 },
				{ _tag: "L", x: 100, y: 0, z: 100 },
			],
			strokeColor: Color.black,
			trimEnd: 0.5,
		});
		const retained = renderer.build(leafOf(data), sync.ctx);
		expect(strokeOf(retained.object).object.visible).toBe(false);
		const group = retained.object.children[2] ?? unreachable();
		expect(group.visible).toBe(true);
		expect(spatialMeshes(group)).toHaveLength(1);
		const geometry = spatialMeshes(group)[0]?.geometry ?? unreachable();
		expect(geometry.getAttribute("instanceStart").getZ(0)).toBe(0);
		expect(geometry.getAttribute("instanceEnd").getX(0)).toBe(100);
		retained.dispose();
		Effect.runSync(Sync.dispose(sync));
	});
});

describe("rounded Rect retained rendering", () => {
	it("shares a centered rounded boundary between fill and coverage under a transformed parent", () => {
		const sync = Sync.make(builtinRegistry);
		const renderer = builtinRenderers.Rect;
		const data = Entity.Rect.make({
			width: 100,
			height: 40,
			cornerRadius: 10,
			strokeColor: Color.black,
			strokeWidth: 2,
		});
		const leaf = leafOf(data);
		leaf.world = { x: 100, y: -30, z: -200 };
		leaf.transform.scale.set(2, 3, 1);
		leaf.transform.quaternion.setFromEuler(new THREE.Euler(0.2, 0.4, 0.3));
		leaf.transform.rotated = true;
		const retained = renderer.build(leaf, sync.ctx);
		const fill = retained.object.children[0];
		if (!(fill instanceof THREE.Mesh)) return unreachable();
		const stroke = strokeOf(retained.object);
		expect(retained.billboard).toBe(false);
		expect(retained.object.position.toArray()).toEqual([100, -30, -200]);
		expect(retained.object.scale.toArray()).toEqual([2, 3, 1]);
		expect(retained.object.quaternion.equals(leaf.transform.quaternion)).toBe(
			true,
		);
		expect(fill.scale.toArray()).toEqual([1, 1, 1]);
		expect(stroke.object.parent).toBe(retained.object);
		// Raycast the actual local triangles, independently of contour builders.
		const hits = (mesh: THREE.Mesh, x: number, y: number) =>
			new THREE.Raycaster(
				new THREE.Vector3(x, y, 1),
				new THREE.Vector3(0, 0, -1),
			).intersectObject(mesh).length > 0;
		expect(hits(fill, 0, 0)).toBe(true);
		expect(hits(fill, 49, 19)).toBe(false);
		expect(hits(stroke.occupancy, 49, 19)).toBe(false);
		expect(hits(fill, 47, 17)).toBe(true);
		expect(hits(stroke.occupancy, 47, 17)).toBe(true);
		expect(hits(stroke.occupancy, 0, 0)).toBe(false);
		expect(stroke.occupancy.material.blending).toBe(THREE.NoBlending);
		retained.dispose();
		Effect.runSync(Sync.dispose(sync));
	});

	it("composes all trim and dash controls on the rounded perimeter without clipping fill", () => {
		const sync = Sync.make(builtinRegistry);
		const renderer = builtinRenderers.Rect;
		const data = Entity.Rect.make({
			width: 100,
			height: 40,
			cornerRadius: 10,
			strokeColor: Color.black,
			strokeWidth: 2,
			trimStart: 0.05,
			trimEnd: 0.2,
			trimOffset: 0.05,
			strokeDasharray: [10, 10],
			strokeDashoffset: 5,
		});
		const retained = renderer.build(leafOf(data), sync.ctx);
		const fill = retained.object.children[0];
		if (!(fill instanceof THREE.Mesh)) return unreachable();
		const fillGeometry = fill.geometry;
		const stroke = strokeOf(retained.object);
		// Perimeter is about 262.8. The trim selects distances 26.3..65.7
		// along the top edge from (-40,20); dashes paint 35..45 and 55..65.
		const box = stroke.occupancy.geometry.boundingBox ?? unreachable();
		expect(box.min.x).toBeCloseTo(-6);
		expect(box.max.x).toBeCloseTo(26);
		expect(box.min.y).toBeCloseTo(19);
		expect(box.max.y).toBeCloseTo(21);
		const occupancy = stroke.occupancy.geometry;
		renderer.update(
			retained,
			leafOf({
				...data,
				fillColor: Color.black,
				strokeColor: Color.white,
				opacity: 0.25,
			}),
			sync.ctx,
		);
		expect(fill.geometry).toBe(fillGeometry);
		expect(stroke.occupancy.geometry).toBe(occupancy);
		expect(stroke.object.material.opacity).toBe(0.25);
		renderer.update(retained, leafOf({ ...data, trimEnd: 0 }), sync.ctx);
		expect(stroke.object.visible).toBe(false);
		expect(fill.visible).toBe(true);
		expect(fill.geometry).toBe(fillGeometry);
		// Circle limit: the shifted quarter-window is the bottom-right arc.
		// Paint at distance ~44, a dash gap at ~54, and an unselected point
		// above the axis distinguish actual coverage from matching bounds.
		renderer.update(
			retained,
			leafOf({
				...data,
				width: 40,
				height: 40,
				cornerRadius: 100,
				trimStart: 0.1,
				trimEnd: 0.35,
				trimOffset: 0.15,
				strokeDashoffset: 0,
			}),
			sync.ctx,
		);
		const covered = (x: number, y: number) =>
			new THREE.Raycaster(
				new THREE.Vector3(x, y, 1),
				new THREE.Vector3(0, 0, -1),
			).intersectObject(stroke.occupancy).length > 0;
		expect(covered(16, -12)).toBe(true);
		expect(covered(8, -18)).toBe(false);
		expect(covered(16, 12)).toBe(false);
		retained.dispose();
		Effect.runSync(Sync.dispose(sync));
	});

	it("rebuilds dimensions and effective radius, releases owned geometry, and protects the shared plane", () => {
		const sync = Sync.make(builtinRegistry);
		const renderer = builtinRenderers.Rect;
		const data = Entity.Rect.make({
			width: 100,
			height: 40,
			strokeColor: Color.black,
		});
		const retained = renderer.build(leafOf(data), sync.ctx);
		const fill = retained.object.children[0];
		if (!(fill instanceof THREE.Mesh)) return unreachable();
		const shared = fill.geometry;
		let sharedDisposals = 0;
		const onSharedDispose = () => {
			sharedDisposals++;
		};
		shared.addEventListener("dispose", onSharedDispose);
		const stroke = strokeOf(retained.object);
		for (const dimensions of [
			{ width: 100, height: 40, cornerRadius: 10 },
			{ width: 100, height: 40, cornerRadius: 1000 },
			{ width: -80, height: 60, cornerRadius: 1000 },
			{ width: -80, height: -80, cornerRadius: 1000 },
			{ width: 100, height: 40, cornerRadius: 0 },
		]) {
			const previous = fill.geometry;
			const oldStroke = stroke.occupancy.geometry;
			let fillDisposed = false,
				strokeDisposed = false;
			previous.addEventListener("dispose", () => {
				fillDisposed = true;
			});
			oldStroke.addEventListener("dispose", () => {
				strokeDisposed = true;
			});
			renderer.update(retained, leafOf({ ...data, ...dimensions }), sync.ctx);
			expect(fill.geometry).not.toBe(previous);
			expect(fillDisposed).toBe(previous !== shared);
			expect(strokeDisposed).toBe(true);
			fill.geometry.computeBoundingBox();
			const bounds = fill.geometry.boundingBox ?? unreachable();
			expect((bounds.max.x - bounds.min.x) * Math.abs(fill.scale.x)).toBe(
				Math.abs(dimensions.width),
			);
			expect((bounds.max.y - bounds.min.y) * Math.abs(fill.scale.y)).toBe(
				Math.abs(dimensions.height),
			);
			if (dimensions.cornerRadius === 1000) {
				const geometry = fill.geometry;
				renderer.update(
					retained,
					leafOf({ ...data, ...dimensions, cornerRadius: 2000 }),
					sync.ctx,
				);
				expect(fill.geometry).toBe(geometry);
			}
		}
		expect(fill.geometry).toBe(shared);
		renderer.update(retained, leafOf({ ...data, cornerRadius: 15 }), sync.ctx);
		let finalFillDisposed = false,
			finalStrokeDisposed = false,
			materialDisposed = false;
		fill.geometry.addEventListener("dispose", () => {
			finalFillDisposed = true;
		});
		stroke.occupancy.geometry.addEventListener("dispose", () => {
			finalStrokeDisposed = true;
		});
		stroke.object.material.addEventListener("dispose", () => {
			materialDisposed = true;
		});
		const { strokeColor: _color, ...withoutOutline } = {
			...data,
			cornerRadius: 15,
		};
		renderer.update(retained, leafOf(withoutOutline), sync.ctx);
		expect(finalStrokeDisposed).toBe(true);
		expect(materialDisposed).toBe(true);
		expect(stroke.object.parent).toBeNull();
		retained.dispose();
		expect(finalFillDisposed).toBe(true);
		expect(sharedDisposals).toBe(0);
		shared.removeEventListener("dispose", onSharedDispose);
		Effect.runSync(Sync.dispose(sync));
	});
});
