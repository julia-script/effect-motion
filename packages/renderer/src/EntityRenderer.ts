import type { ThreeRaw as THREE } from "@effect-motion/three";
import type { Effect } from "effect";
import type { EffectMotionError, Entity } from "effect-motion";
import type * as Images from "./Images.js";
import type * as Text from "./Text.js";

/**
 * The contract for drawing one kind of entity — how you teach the renderer
 * to draw something it does not already know.
 *
 * @remarks
 * Renderers are RETAINED rather than immediate: instead of one paint
 * function called every frame, each provides three moments in an object's
 * life.
 *
 * - `build` — create the three object, once, when the instance first appears.
 * - `update` — mutate that object when its data or world position changed.
 *   Skipped entirely on frames where nothing changed.
 * - `dispose` (on the returned {@link Retained}) — release GPU resources
 *   when the instance leaves the frame.
 *
 * The split is what keeps a still scene cheap and, more importantly, what
 * makes GPU resources land in a `dispose` you control: geometries,
 * materials, and textures created in `build` are yours to free.
 *
 * Register renderers through the `renderers` option on either
 * `Renderer.make` or the Node adapter's `make`; the map is merged over the
 * built-ins by entity tag, so the same mechanism adds a new kind or
 * overrides an existing one.
 */

/**
 * A leaf's final position in scene space, with every ancestor group's
 * translation already folded in.
 *
 * @remarks
 * Absolute, not relative: a renderer never has to walk parents itself. Still
 * in SCENE coordinates (y down, origin top-left) — use
 * {@link RenderContext.toThree} to convert.
 */
export interface World {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

/**
 * The services a renderer implementation gets from the engine: coordinate
 * conversion, viewport size, async registration, and the shared text and
 * image actors.
 */
export interface RenderContext {
	/**
	 * Convert scene coordinates to three coordinates.
	 *
	 * @remarks
	 * The two spaces disagree about the origin and the y axis: scene space
	 * puts (0, 0) at the top-left with y increasing DOWNWARD, three puts it at
	 * the viewport center with y increasing upward. `z` means the same in
	 * both. Always position objects through this rather than converting by
	 * hand.
	 */
	readonly toThree: (x: number, y: number, z: number) => THREE.Vector3;
	/** Current viewport width in scene units. */
	readonly width: number;
	/** Current viewport height in scene units. */
	readonly height: number;
	/**
	 * Register async work the frame must not be drawn without.
	 *
	 * @remarks
	 * `build` and `update` are synchronous, but some content is not ready
	 * immediately — a glyph layout, a texture decode. Hand that work here and
	 * the render path waits for it before presenting, so a frame never ships
	 * half-built. Failures surface in the render call's error channel.
	 */
	readonly waitFor: (work: Effect.Effect<unknown, EffectMotionError>) => void;
	/** The shared SDF text actor: registered fonts, the glyph atlas, layout. */
	readonly text: Text.Text;
	/** Decoded image textures, cached for the renderer's scope. */
	readonly images: Images.Images;
}

/**
 * One instance as it is handed to a renderer: its id, its entity data for
 * this frame, and its composed world position.
 *
 * @typeParam Ent - The entity data type this renderer draws.
 */
export interface Leaf<Ent = Entity.Entity> {
	readonly id: string;
	readonly data: Ent;
	readonly world: World;
}

/**
 * What a renderer hands back from `build` and keeps for the life of an
 * instance: the three object, its billboard behavior, and how to free it.
 */
export interface Retained {
	readonly object: THREE.Object3D;
	/**
	 * Whether the object turns to face the camera each frame.
	 *
	 * @remarks
	 * `true` keeps an authored silhouette intact under any camera orbit — a
	 * circle stays circular rather than foreshortening into an ellipse.
	 * `false` lets the object sit in the world as a real oriented plane.
	 *
	 * Mutable, because a shape can change its mind: a Rect billboards while
	 * its rotation is zero and stops the moment it tilts.
	 */
	billboard: boolean;
	/**
	 * Release GPU resources — geometries, materials, textures.
	 *
	 * @remarks
	 * Called when the instance leaves the frame or the renderer's scope
	 * closes. Anything allocated in `build` that holds GPU memory is freed
	 * here; three does not do it for you.
	 */
	readonly dispose: () => void;
}

/**
 * How to draw one kind of entity.
 *
 * @remarks
 * See the module overview for the retained `build` / `update` / `dispose`
 * lifecycle. Pass an implementation via the `renderers` option on
 * `Renderer.make` or the Node adapter's `make`, keyed by entity tag.
 *
 * @typeParam Ent - The entity data type this renderer draws.
 *
 * @example
 * Override how Circles are drawn — a flat wireframe instead of the built-in.
 * ```typescript
 * const wireCircle: EntityRenderer.EntityRenderer<Entity.EntityByTag<"Circle">> = {
 * 	build: (leaf, ctx) => {
 * 		const geometry = new THREE.CircleGeometry(leaf.data.radius, 32);
 * 		const material = new THREE.MeshBasicMaterial({ wireframe: true });
 * 		const object = new THREE.Mesh(geometry, material);
 * 		object.position.copy(ctx.toThree(leaf.world.x, leaf.world.y, leaf.world.z));
 * 		return {
 * 			object,
 * 			billboard: true,
 * 			dispose: () => {
 * 				geometry.dispose();
 * 				material.dispose();
 * 			},
 * 		};
 * 	},
 * 	update: (retained, leaf, ctx) => {
 * 		retained.object.position.copy(
 * 			ctx.toThree(leaf.world.x, leaf.world.y, leaf.world.z),
 * 		);
 * 	},
 * };
 *
 * const renderer = yield* NodeRenderer.make({
 * 	width: 500,
 * 	height: 300,
 * 	renderers: { Circle: wireCircle },
 * });
 * ```
 */
export interface EntityRenderer<Ent> {
	/**
	 * Create the three object for a newly appeared instance.
	 *
	 * @remarks
	 * Called once per instance. Anything allocated here that holds GPU memory
	 * must be released by the returned {@link Retained}'s `dispose`.
	 */
	readonly build: (leaf: Leaf<Ent>, ctx: RenderContext) => Retained;
	/**
	 * Mutate an existing object because its data or world position changed.
	 *
	 * @remarks
	 * Called only when something actually changed, so this is where per-frame
	 * work belongs. Mutate the retained object in place rather than replacing
	 * it — the engine holds the reference already in the scene.
	 */
	readonly update: (
		retained: Retained,
		leaf: Leaf<Ent>,
		ctx: RenderContext,
	) => void;
}

/**
 * An exhaustive map from every built-in entity tag to its renderer.
 *
 * @remarks
 * Exhaustive on purpose: adding an entity to the core library without a
 * renderer here is a compile error rather than a blank space at runtime.
 */
export type EntityRenderers = {
	readonly [Tag in Entity.EntityTag]: EntityRenderer<Entity.EntityByTag<Tag>>;
};
