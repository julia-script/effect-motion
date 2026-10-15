import * as Gpu from "@effect-motion/three/Renderer";
import * as RenderTarget from "@effect-motion/three/RenderTarget";
import * as ThreeScene from "@effect-motion/three/Scene";
import { ThreeException } from "@effect-motion/three/ThreeException";
import * as Effect from "effect/Effect";
import * as Color from "effect-motion/Color";
import * as THREE from "three/webgpu";
import * as Paint from "./Paint.js";
import * as Sampling from "./Sampling.js";

export interface Point {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}
export interface Subpath {
	readonly points: ReadonlyArray<Point>;
	readonly closed: boolean;
}

/** All defining points, including separate subpaths, must share a local plane. */
export const planar = (paths: ReadonlyArray<Subpath>): boolean => {
	let z: number | undefined;
	for (const path of paths)
		for (const point of path.points) {
			z ??= point.z;
			if (point.z !== z) return false;
		}
	return true;
};

/** One painted stroke, with geometry/coverage retained separately from color. */
export interface Stroke {
	readonly object: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicNodeMaterial>;
	readonly scene: ThreeScene.Scene;
	readonly camera: THREE.OrthographicCamera;
	readonly occupancy: THREE.Mesh<
		THREE.BufferGeometry,
		THREE.MeshBasicNodeMaterial
	>;
	readonly stats: {
		geometryBuilds: number;
		rasterizations: number;
		allocations: number;
		resizes: number;
	};
	target: RenderTarget.RenderTarget | null;
	key: string;
	dirty: boolean;
	bounds: Paint.Bounds;
}
const strokes = new WeakMap<THREE.Object3D, Stroke>();
export const fromObject = (object: THREE.Object3D): Stroke | undefined =>
	strokes.get(object);

export const make = (): Stroke => {
	const material = new THREE.MeshBasicNodeMaterial({
		transparent: true,
		side: THREE.DoubleSide,
		alphaTest: 0.00001,
	});
	const object = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
	const occupancy = new THREE.Mesh(
		new THREE.BufferGeometry(),
		new THREE.MeshBasicNodeMaterial({
			color: 0xffffff,
			side: THREE.DoubleSide,
			blending: THREE.NoBlending,
			depthTest: false,
			depthWrite: false,
		}),
	);
	const scene = ThreeScene.makeUnsafe(new THREE.Scene());
	ThreeScene.add(scene, [occupancy]);
	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
	camera.position.z = 1;
	const stroke: Stroke = {
		object,
		occupancy,
		scene,
		camera,
		target: null,
		key: "",
		dirty: true,
		bounds: { x: 0, y: 0, width: 1, height: 1 },
		stats: { geometryBuilds: 0, rasterizations: 0, allocations: 0, resizes: 0 },
	};
	strokes.set(object, stroke);
	return stroke;
};

/** Rectangular segment bodies plus round joins/endpoints form the silhouette.
 * Overlap is intentional: occupancy is replaced per sample, never alpha blended.
 */
export const silhouette = (
	paths: ReadonlyArray<Subpath>,
	width: number,
): Array<number> => {
	const vertices: Array<number> = [];
	const radius = Math.max(0, width) / 2;
	if (radius === 0) return vertices;
	const triangle = (
		ax: number,
		ay: number,
		bx: number,
		by: number,
		cx: number,
		cy: number,
	) => vertices.push(ax, ay, 0, bx, by, 0, cx, cy, 0);
	const roundSegments = Math.max(
		16,
		Math.min(256, Math.ceil(Math.PI * Math.sqrt(radius / 0.05))),
	);
	for (const path of paths) {
		// Each vertex contributes one round join (or one cap at an open end).
		for (const point of path.points) {
			for (let i = 0; i < roundSegments; i++) {
				const a = (i * Math.PI * 2) / roundSegments,
					b = ((i + 1) * Math.PI * 2) / roundSegments;
				triangle(
					point.x,
					point.y,
					point.x + radius * Math.cos(a),
					point.y + radius * Math.sin(a),
					point.x + radius * Math.cos(b),
					point.y + radius * Math.sin(b),
				);
			}
		}
		const count = path.closed ? path.points.length : path.points.length - 1;
		for (let i = 0; i < count; i++) {
			const a = path.points[i],
				b = path.points[(i + 1) % path.points.length];
			if (a === undefined || b === undefined) continue;
			const length = Math.hypot(b.x - a.x, b.y - a.y);
			if (length === 0) continue;
			const nx = (-(b.y - a.y) * radius) / length,
				ny = ((b.x - a.x) * radius) / length;
			triangle(a.x + nx, a.y + ny, a.x - nx, a.y - ny, b.x + nx, b.y + ny);
			triangle(a.x - nx, a.y - ny, b.x - nx, b.y - ny, b.x + nx, b.y + ny);
		}
	}
	return vertices;
};

export const update = (
	stroke: Stroke,
	paths: ReadonlyArray<Subpath>,
	width: number,
	color: Color.Color,
	opacity: number,
): void => {
	const rgba = Color.bytes(color);
	stroke.object.material.color.setRGB(
		rgba.r / 255,
		rgba.g / 255,
		rgba.b / 255,
		THREE.SRGBColorSpace,
	);
	stroke.object.material.opacity = (rgba.a / 255) * opacity;
	stroke.object.visible =
		width > 0 &&
		stroke.object.material.opacity > 0 &&
		paths.some((path) => path.points.length > 0);
	const key = JSON.stringify([width, paths]);
	if (stroke.key === key) return;
	stroke.key = key;
	stroke.dirty = true;
	stroke.stats.geometryBuilds++;
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute(
		"position",
		new THREE.Float32BufferAttribute(silhouette(paths, width), 3),
	);
	geometry.computeBoundingBox();
	stroke.occupancy.geometry.dispose();
	stroke.occupancy.geometry = geometry;
	const box = geometry.boundingBox;
	if (box === null || box.isEmpty()) {
		stroke.object.visible = false;
		return;
	}
	const padding = 2;
	stroke.bounds = {
		x: box.min.x - padding,
		y: box.min.y - padding,
		width: box.max.x - box.min.x + padding * 2,
		height: box.max.y - box.min.y + padding * 2,
	};
	const bounds = stroke.bounds;
	stroke.camera.left = bounds.x;
	stroke.camera.right = bounds.x + bounds.width;
	stroke.camera.top = bounds.y + bounds.height;
	stroke.camera.bottom = bounds.y;
	stroke.camera.updateProjectionMatrix();
	stroke.object.position.set(
		bounds.x + bounds.width / 2,
		bounds.y + bounds.height / 2,
		paths[0]?.points[0]?.z ?? 0,
	);
	stroke.object.scale.set(bounds.width, bounds.height, 1);
};

/** Rasterize only changed coverage. Color/opacity changes reuse this result. */
export const render = Effect.fnUntraced(function* (
	stroke: Stroke,
	renderer: Gpu.Renderer,
	density: number,
): Effect.fn.Return<void, ThreeException> {
	if (!stroke.object.visible) return;
	const width = Sampling.extent(
		stroke.bounds.width,
		density * Sampling.coverageScale,
	);
	const height = Sampling.extent(
		stroke.bounds.height,
		density * Sampling.coverageScale,
	);
	if (
		!Number.isFinite(width + height) ||
		Math.max(width, height) > Gpu.maxTextureSize(renderer)
	)
		return yield* Effect.fail(
			new ThreeException({
				operation: `stroke "${stroke.object.name}": target ${width}×${height} exceeds device limit`,
			}),
		);
	if (stroke.target === null) {
		stroke.target = RenderTarget.makeUnsafe(width, height, {
			samples: Sampling.samples,
			generateMipmaps: true,
			minFilter: THREE.LinearMipmapLinearFilter,
		});
		RenderTarget.bindCoverage(stroke.target, stroke.object.material);
		stroke.stats.allocations++;
		stroke.dirty = true;
	} else if (
		RenderTarget.width(stroke.target) !== width ||
		RenderTarget.height(stroke.target) !== height
	) {
		RenderTarget.setSize(stroke.target, width, height);
		stroke.stats.resizes++;
		stroke.dirty = true;
	}
	if (!stroke.dirty) return;
	const previous = Gpu.getRenderTarget(renderer);
	Gpu.setRenderTarget(renderer, stroke.target);
	yield* Gpu.render(renderer, stroke.scene, stroke.camera).pipe(
		Effect.ensuring(Effect.sync(() => Gpu.setRenderTarget(renderer, previous))),
	);
	stroke.dirty = false;
	stroke.stats.rasterizations++;
});

export const renderObjects = Effect.fnUntraced(function* (
	renderer: Gpu.Renderer,
	objects: ReadonlyArray<THREE.Object3D>,
	camera: THREE.PerspectiveCamera,
	width: number,
	height: number,
	density: number,
) {
	const pending: Array<Stroke> = [];
	for (const object of objects)
		object.traverseVisible((child) => {
			const stroke = fromObject(child);
			if (stroke !== undefined) pending.push(stroke);
		});
	for (const stroke of pending) {
		// The quad itself is scaled to its bounds; its parent supplies the
		// authored transform. One local unit must stay one unit for density.
		const parent = stroke.object.parent ?? stroke.object;
		const localDensity = Paint.density(
			parent,
			camera,
			width,
			height,
			density,
			stroke.bounds.width,
			stroke.bounds.height,
			stroke.object.position,
		);
		yield* render(stroke, renderer, localDensity);
	}
});

export const dispose = (stroke: Stroke): void => {
	stroke.object.geometry.dispose();
	stroke.object.material.dispose();
	stroke.occupancy.geometry.dispose();
	stroke.occupancy.material.dispose();
	if (stroke.target !== null) RenderTarget.dispose(stroke.target);
	strokes.delete(stroke.object);
};
