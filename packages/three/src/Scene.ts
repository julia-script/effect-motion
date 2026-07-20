import type { Scope } from "effect";
import { Effect, Predicate } from "effect";
import { dual } from "effect/Function";
import * as Pipeable from "effect/Pipeable";
import * as THREE from "three/webgpu";
import type * as Object3D from "./Object3D.js";

/**
 * The scene-graph root actor: a branded handle over `THREE.Scene`.
 *
 * Three is already actor-shaped, so this is a branding + lifecycle layer,
 * not a redesign (see AGENTS.md). Mutation here — `add`, `remove`,
 * `clear`, `setBackground` — is infallible field bookkeeping on an object
 * we already hold, so it stays sync and chains through `.pipe`; Effect
 * enters at construction (which registers teardown) and at anything that
 * can fail or is async.
 */

export const TypeId = "~three/Scene" as const;

export interface Scene extends Pipeable.Pipeable {
	readonly [TypeId]: typeof TypeId;
	readonly "~three.scene": THREE.Scene;
}

export const isScene = (u: unknown): u is Scene =>
	Predicate.hasProperty(u, TypeId);

/**
 * `dual`'s predicate receives the whole `arguments` object, not the first
 * argument — dispatch on `args[0]`, as the motion package's animators do.
 * Guard-based, never arity (AGENTS.md).
 */
const firstArgIsScene = (args: IArguments) => isScene(args[0]);

/**
 * Brand an existing `THREE.Scene` WITHOUT registering teardown — for a
 * scene whose lifetime something else already owns. Prefer `make`.
 */
export const makeUnsafe = (scene: THREE.Scene): Scene => {
	const self: Scene = {
		[TypeId]: TypeId,
		"~three.scene": scene,
		// pipeArguments reads its second parameter as an array-like; a rest
		// array satisfies that at runtime, and the cast avoids both the
		// `arguments` object and a lint suppression
		pipe(...fns: ReadonlyArray<(value: unknown) => unknown>) {
			return Pipeable.pipeArguments(self, fns as unknown as IArguments);
		},
	};
	return self;
};

/**
 * A scoped scene: detaches its children on scope close.
 *
 * `clear` only unparents — it does NOT dispose geometries, materials, or
 * textures, because a scene does not own them (they are shared across
 * objects and outlive any one graph). Whoever created those disposes
 * them; in this repo that is the renderer's retained entries.
 */
export const make = Effect.fnUntraced(function* (): Effect.fn.Return<
	Scene,
	never,
	Scope.Scope
> {
	const scene = new THREE.Scene();
	yield* Effect.addFinalizer(() => Effect.sync(() => scene.clear()));
	return makeUnsafe(scene);
});

/** Detach every child (see `make` on what this deliberately does not do). */
export const clear = (self: Scene): Scene => {
	self["~three.scene"].clear();
	return self;
};

/** The scene root's direct children. */
export const children = (self: Scene): ReadonlyArray<Object3D.Object3D> =>
	self["~three.scene"].children;

/** Whether the scene root has no children — the "nothing to render" check. */
export const isEmpty = (self: Scene): boolean =>
	self["~three.scene"].children.length === 0;

/** Attach objects to the scene root. */
export const add: {
	(objects: ReadonlyArray<Object3D.Object3D>): (self: Scene) => Scene;
	(self: Scene, objects: ReadonlyArray<Object3D.Object3D>): Scene;
} = dual(
	firstArgIsScene,
	(self: Scene, objects: ReadonlyArray<Object3D.Object3D>) => {
		self["~three.scene"].add(...objects);
		return self;
	},
);

/** Detach objects from the scene root (no-op for objects not attached). */
export const remove: {
	(objects: ReadonlyArray<Object3D.Object3D>): (self: Scene) => Scene;
	(self: Scene, objects: ReadonlyArray<Object3D.Object3D>): Scene;
} = dual(
	firstArgIsScene,
	(self: Scene, objects: ReadonlyArray<Object3D.Object3D>) => {
		self["~three.scene"].remove(...objects);
		return self;
	},
);

/**
 * Set the clear background, or `null` for a transparent scene (what a
 * HUD tier and a comp with no background color want).
 */
export const setBackground: {
	(background: THREE.Color | THREE.Texture | null): (self: Scene) => Scene;
	(self: Scene, background: THREE.Color | THREE.Texture | null): Scene;
} = dual(
	firstArgIsScene,
	(self: Scene, background: THREE.Color | THREE.Texture | null) => {
		self["~three.scene"].background = background;
		return self;
	},
);
