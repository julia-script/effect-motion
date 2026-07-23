import type { Scope } from "effect";
import { Effect, Predicate } from "effect";
import { dual } from "effect/Function";
import * as Pipeable from "effect/Pipeable";
import * as THREE from "three/webgpu";
import type * as Object3D from "./Object3D.js";

/**
 * The scene graph root — a scoped handle over three's `Scene`.
 *
 * @remarks
 * three is already shaped the way this wrapper wants, so this is a
 * branding-and-lifecycle layer rather than a redesign. Everything here —
 * {@link add}, {@link remove}, {@link clear}, {@link setBackground} — is
 * infallible bookkeeping on an object already in hand, so it stays
 * synchronous and chains through `.pipe`. Effect enters only at
 * {@link make}, which registers teardown.
 *
 * @example
 * ```typescript
 * const scene = yield* Scene.make();
 * scene.pipe(Scene.add([mesh]), Scene.setBackground(new Color(0x16161d)));
 * ```
 */

export const TypeId = "~three/Scene" as const;

/**
 * A handle to a three scene.
 *
 * @remarks
 * The underlying scene stays reachable through `~three.scene` for anything
 * this wrapper does not cover.
 */
export interface Scene extends Pipeable.Pipeable {
	readonly [TypeId]: typeof TypeId;
	readonly "~three.scene": THREE.Scene;
}

/** Whether `u` is a {@link Scene} handle. */
export const isScene = (u: unknown): u is Scene =>
	Predicate.hasProperty(u, TypeId);

/**
 * `dual`'s predicate receives the whole `arguments` object, not the first
 * argument — dispatch on `args[0]`, as the motion package's animators do.
 * Guard-based, never arity (AGENTS.md).
 */
const firstArgIsScene = (args: IArguments) => isScene(args[0]);

/**
 * Wrap an existing three scene WITHOUT registering teardown.
 *
 * @remarks
 * For a scene whose lifetime something else already owns and will clean up.
 * Prefer {@link make}, which ties teardown to a scope; reach for this only
 * when a longer-lived owner is genuinely in charge.
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
 * A scoped scene that detaches its children when the scope closes.
 *
 * @remarks
 * Detaching is NOT disposal. A scene does not own the geometries,
 * materials, and textures hanging off its objects — those are routinely
 * shared between objects and outlive any one graph — so whoever created
 * them is responsible for freeing them.
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

/**
 * Detach every child from the scene root.
 *
 * @remarks
 * Unparents only — see {@link make} on why this does not dispose anything.
 */
export const clear = (self: Scene): Scene => {
	self["~three.scene"].clear();
	return self;
};

/** The scene root's direct children (not a deep traversal). */
export const children = (self: Scene): ReadonlyArray<Object3D.Object3D> =>
	self["~three.scene"].children;

/**
 * Whether the scene root has no children.
 *
 * @remarks
 * The "is there anything to draw" check — worth making before an optional
 * pass, so an empty overlay tier costs nothing.
 */
export const isEmpty = (self: Scene): boolean =>
	self["~three.scene"].children.length === 0;

/**
 * Attach objects to the scene root.
 *
 * @remarks
 * Re-adding an object that is already parented moves it, as in three
 * itself — an object has exactly one parent.
 */
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

/**
 * Detach objects from the scene root.
 *
 * @remarks
 * A no-op for objects that are not attached, and it does not dispose them —
 * a removed object can be added back.
 */
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
 * Set the background color or texture, or `null` for transparency.
 *
 * @remarks
 * `null` is what an overlay tier wants: with nothing painted behind it,
 * whatever was rendered first shows through.
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
