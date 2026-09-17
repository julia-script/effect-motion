import type * as Runner from "effect-motion/Runner";
import * as THREE from "three/webgpu";
import * as Sampling from "./Sampling.js";

/** Retained material defaults, restored when an object moves to a depth tier. */
const depthState = new WeakMap<
	THREE.Material,
	{
		depthTest: boolean;
		depthWrite: boolean;
		transparent: boolean;
	}
>();

/** Apply a context's policy to every draw, including custom renderer children. */
export const order = (
	object: THREE.Object3D,
	mode: Runner.Compositing,
	id: string,
	start: number,
): number => {
	let rank = start;
	object.traverse((child) => {
		child.renderOrder = mode === "paint" ? rank : 0;
		rank++;
		child.name = `${id}/${rank - start}`;
		// Group.renderOrder is a separate sort key. Keep the whole context
		// in one group so leaves and isolated surfaces can interleave.
		if (child instanceof THREE.Group) child.renderOrder = 0;
		if (!(child instanceof THREE.Mesh)) return;
		const materials = Array.isArray(child.material)
			? child.material
			: [child.material];
		for (const material of materials) {
			let original = depthState.get(material);
			if (original === undefined) {
				original = {
					depthTest: material.depthTest,
					depthWrite: material.depthWrite,
					transparent: material.transparent,
				};
				depthState.set(material, original);
			}
			const transparent = mode === "paint" || original.transparent;
			if (material.transparent !== transparent) material.needsUpdate = true;
			material.transparent = transparent;
			material.depthTest = mode === "depth" && original.depthTest;
			material.depthWrite = mode === "depth" && original.depthWrite;
		}
	});
	return rank;
};

export interface Bounds {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/** Project retained geometry into the canonical local plane, after async layout. */
export const bounds = (
	objects: ReadonlyArray<THREE.Object3D>,
	camera: THREE.PerspectiveCamera,
	width: number,
	height: number,
): Bounds | undefined => {
	camera.updateMatrixWorld(true);
	const extent = new THREE.Box2();
	for (const object of objects) {
		if (!object.visible) continue;
		object.updateMatrixWorld(true);
		object.traverseVisible((child) => {
			if (!(child instanceof THREE.Mesh)) return;
			const box = new THREE.Box3().setFromObject(child);
			if (box.isEmpty()) return;
			const materials = Array.isArray(child.material)
				? child.material
				: [child.material];
			let padding = 0;
			for (const material of materials) {
				if ("linewidth" in material && typeof material.linewidth === "number")
					padding = Math.max(padding, material.linewidth / 2);
			}
			box.min.x -= padding;
			box.min.y -= padding;
			box.max.x += padding;
			box.max.y += padding;
			for (const x of [box.min.x, box.max.x])
				for (const y of [box.min.y, box.max.y])
					for (const z of [box.min.z, box.max.z]) {
						const point = new THREE.Vector3(x, y, z).project(camera);
						if (Number.isFinite(point.x) && Number.isFinite(point.y))
							extent.expandByPoint(
								new THREE.Vector2(
									(point.x * width) / 2,
									(point.y * height) / 2,
								),
							);
					}
		});
	}
	if (extent.isEmpty()) return undefined;
	extent.expandByScalar(2);
	return {
		x: extent.min.x,
		y: extent.min.y,
		width: extent.max.x - extent.min.x,
		height: extent.max.y - extent.min.y,
	};
};

/** Conservative local pixel density at the surface's center and corners. */
export const density = (
	object: THREE.Object3D,
	camera: THREE.PerspectiveCamera,
	width: number,
	height: number,
	parentDensity: number,
	extentX: number,
	extentY: number,
	origin = { x: 0, y: 0, z: 0 },
): number => {
	object.updateWorldMatrix(true, false);
	camera.updateMatrixWorld(true);
	const project = (x: number, y: number) => {
		const p = new THREE.Vector3(x + origin.x, y + origin.y, origin.z)
			.applyMatrix4(object.matrixWorld)
			.project(camera);
		return new THREE.Vector2(
			(p.x * (camera.view?.enabled ? camera.view.width : width)) / 2,
			(p.y * (camera.view?.enabled ? camera.view.height : height)) / 2,
		);
	};
	let magnification = 1;
	for (const x of [-extentX / 2, 0, extentX / 2])
		for (const y of [-extentY / 2, 0, extentY / 2]) {
			const p = project(x, y);
			magnification = Math.max(
				magnification,
				p.distanceTo(project(x + 1, y)),
				p.distanceTo(project(x, y + 1)),
			);
		}
	// Small numerical differences must not resize a stationary surface.
	return Sampling.densityBucket(magnification * parentDensity);
};
