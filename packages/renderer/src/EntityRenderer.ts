import type { THREE } from "@effect-motion/three";
import type * as Entity from "effect-motion/Entity";
import type { ImageStore } from "./images.js";
import type { TextEngine } from "./text.js";

/**
 * The retained entity render contract — the successor to the immediate-mode
 * `PaintFunction`. Each entity provides `build` (create the three object on
 * first appearance), `update` (mutate it when data or world position
 * changed), and `dispose` via the returned `Retained` (release GPU resources
 * when the instance leaves the frame). Custom entities register through the
 * same shape; built-in coverage is a type-level guarantee (see
 * `builtinRenderers`).
 */

/** Composed world position of a leaf (ancestor translations folded in). */
export interface World {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

/** What the renderer knows that entity implementations need. */
export interface RenderContext {
	/**
	 * scene world coords → three coords: origin shifted to the viewport
	 * center, y flipped, z kept (+z toward the viewer in both spaces).
	 */
	readonly toThree: (x: number, y: number, z: number) => THREE.Vector3;
	readonly width: number;
	readonly height: number;
	/**
	 * register async work (SDF layout, texture decode) the frame's render
	 * must wait for — the render path drains these before presenting, so
	 * export frames never ship half-built content.
	 */
	readonly waitFor: (work: Promise<unknown>) => void;
	/** the renderer's SDF text engine (fonts, atlas, layout) */
	readonly text: TextEngine;
	/** decoded image textures, cached per renderer scope */
	readonly images: ImageStore;
}

/** One leaf instance as the frame walk hands it to an entity renderer. */
export interface Leaf<Ent extends Entity.AnyEntity = Entity.AnyEntity> {
	readonly id: string;
	readonly entity: Ent;
	readonly data: Ent["data"]["Type"];
	readonly world: World;
}

/** The retained state an entity renderer owns for one instance. */
export interface Retained {
	readonly object: THREE.Object3D;
	/**
	 * view-plane billboard: the renderer copies the camera quaternion onto
	 * the object each frame so it keeps its authored silhouette under any
	 * camera orbit. Mutable — a rect flips this off when it tilts.
	 */
	billboard: boolean;
	/** release GPU resources (geometries, materials, textures) */
	readonly dispose: () => void;
}

export interface EntityRenderer<Ent extends Entity.AnyEntity> {
	readonly build: (leaf: Leaf<Ent>, ctx: RenderContext) => Retained;
	readonly update: (
		retained: Retained,
		leaf: Leaf<Ent>,
		ctx: RenderContext,
	) => void;
}

/**
 * A registry of entity renderers keyed by entity name. `EntityRenderers<E>`
 * is the exhaustive map over an entity union — a built-in with no renderer
 * is a type error, not a runtime surprise (the same coverage-manifest
 * guarantee `PaintFunctions` gives the ThorVG path).
 */
export type EntityRenderers<Entities extends Entity.AnyEntity> = {
	readonly [K in Entities as K["name"]]: EntityRenderer<K>;
};
