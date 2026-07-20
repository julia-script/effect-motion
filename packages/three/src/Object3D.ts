import type * as THREE from "three/webgpu";

/**
 * Leaf value type: an `Object3D` carries no lifecycle of its own — the
 * disposables hang off it (geometries, materials), and those get their
 * own modules — so it stays a plain alias to three's type rather than a
 * branded handle. See "Wrapping a library that is already actor-shaped"
 * in AGENTS.md.
 *
 * Imported from `three/webgpu` (not `three`) so it is the same nominal
 * type the rest of the package uses; the two entries declare separate
 * class identities to TypeScript.
 */
export type Object3D = THREE.Object3D;
