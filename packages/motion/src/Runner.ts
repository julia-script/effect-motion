import { Layer } from "effect";
import type * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Fiber from "effect/Fiber";
import * as Color from "./Color.js";
import * as Entity from "./Entity.js";
import * as Instance from "./Instance.js";
import * as Phaser from "./Phaser.js";
import * as Projection from "./Projection.js";
import { ROOT_ID, Tree } from "./Tree.js";

export const TypeId = "~motion/SceneRunner" as const;

export { ROOT_ID };

export type Seed = number | string;

/**
 * The seed used when none is given.
 *
 * @remarks
 * Fixed rather than random on purpose: a scene using randomness still
 * produces identical frames on every run unless you deliberately vary the
 * seed.
 */
export const defaultSeed: Seed = "effect-motion";

/**
 * Playback settings — how a scene RUNS, as opposed to what it IS.
 *
 * @remarks
 * Passed to `Scene.run` / `Scene.stream`, so the same scene can be played
 * back at different rates or seeds without being rewritten. Resolution and
 * background are NOT here: those are the composition's own identity, fixed
 * at `Scene.make`.
 */
export type Settings = {
	/**
	 * Frames produced per second of scene time.
	 *
	 * @remarks
	 * Determines how many frames a given duration becomes: a one-second
	 * animation is 30 frames at 30fps and 60 at 60fps. It changes the
	 * sampling, never the motion — the same scene looks the same, just
	 * smoother.
	 *
	 * @defaultValue `60`
	 */
	frameRate: number;
	/**
	 * Seeds the scene's random number generator.
	 *
	 * @remarks
	 * Randomness in a scene comes from this seed rather than
	 * `Math.random()`, so the "random" scatter of a particle field is
	 * identical on every run. Change the seed to get a different arrangement
	 * that is itself reproducible.
	 *
	 * Note the generator belongs to `effect`, so upgrading it can change the
	 * sequence a given seed produces.
	 *
	 * @defaultValue `"effect-motion"`
	 */
	seed: Seed;
	/**
	 * Hard cap on how many frames a scene may produce.
	 *
	 * @remarks
	 * A safety net: a scene that exceeds it fails with a message naming the
	 * limit instead of hanging whatever is consuming it. The usual cause is
	 * an unbounded loop with nothing to end it.
	 *
	 * Set it to `Infinity` to declare a deliberately endless scene.
	 *
	 * @defaultValue `36_000` — ten minutes at 60fps
	 */
	maxFrames: number;
};

/**
 * What a composition IS: its pixel dimensions and background.
 *
 * @remarks
 * Set at `Scene.make` and carried on every frame, so a frame is
 * self-describing. A nested scene keeps its own config as its bounds — that
 * is what a played scene clips and paints within.
 */
export type CompConfig = {
	width: number;
	height: number;
	/** carried on every frame so renderers can paint it; transparent = nothing painted */
	backgroundColor: Color.Color;
};

export const defaultComp: CompConfig = {
	width: 1920,
	height: 1080,
	backgroundColor: Color.transparent,
};

/** A handle to a container (`Group` or `Hud`) — the only mountable parents. */
export type GroupInstance = Instance.Instance<Entity.ContainerTag>;

/**
 * A child in a polymorphic `children` list: a plain string (→ a `Text`),
 * an already-created `Instance`, or an `Effect` that resolves to one (a
 * not-yet-yielded `instantiate` — yielded internally so JSX children need
 * no `yield*`). Normalized to a stored child id in list order.
 */
export type Child =
	| string
	| Instance.Instance
	| Effect.Effect<Instance.Instance, never, Runner>;

/**
 * The input `instantiate` accepts: the entity's own make-input, except that
 * a `children` field (stored as `Array<string>` of ids) is authored as the
 * polymorphic {@link Child} list — the runner normalizes it to ids in list
 * order.
 */
export type InstantiateProps<Tag extends Entity.EntityTag> = Omit<
	Entity.MakeInput<Tag>,
	"children"
> &
	(Tag extends Entity.ContainerTag
		? { readonly children?: ReadonlyArray<Child> }
		: Record<never, never>);

/**
 * The ambient mount parent for `instantiate` — provided per scene
 * evaluation (`Scene.play({ parent })`); `null` means the runner root.
 */
export const CurrentParent = Context.Reference<GroupInstance | null>(
	"motion/Runner/CurrentParent",
	{ defaultValue: () => null },
);

/**
 * A branch of animation as the runner tracks it: its fiber and its
 * SEMANTIC end (`finished` resolves at `Scene.finish` or completion,
 * whichever comes first).
 */
export interface BranchEntry {
	readonly fiber: Fiber.Fiber<unknown, unknown>;
	readonly finished: Effect.Effect<void>;
}

const nodeNotFound = (id: string): never => {
	throw new Error(`Runner: node "${id}" not found`);
};

/**
 * The entity → view bridge. `Projection.CameraView` is flat (x/y/z,
 * rotX/rotY/rotZ) while the Camera entity nests position/rotation, so the
 * conversion happens HERE, once, at the frame boundary — the renderer and
 * the projection math keep the contract they already had.
 */
const toCameraView = (
	camera: Entity.EntityByTag<"Camera">,
): Projection.CameraView & Projection.PointOfInterest => ({
	x: camera.position.x,
	y: camera.position.y,
	z: camera.position.z,
	rotX: camera.rotation.x,
	rotY: camera.rotation.y,
	rotZ: camera.rotation.z,
	focalLength: camera.focalLength,
	focusDistance: camera.focusDistance,
	aperture: camera.aperture,
	...(camera.poi === null
		? {}
		: { poiX: camera.poi.x, poiY: camera.poi.y, poiZ: camera.poi.z }),
});

/**
 * The resting camera for a comp of the given width: width-relative focal
 * length (AE's 50mm equivalent), positioned so the z=0 plane projects at
 * scale 1 and is in focus.
 */
export const identityCameraView = (
	width: number,
): Projection.CameraView & Projection.PointOfInterest =>
	toCameraView(identityCamera(width));

export const identityCamera = (width: number): Entity.EntityByTag<"Camera"> => {
	const focalLength = Projection.defaultFocalLength(width);
	const z = Projection.defaultCameraZ(focalLength);
	return Entity.Camera.make({
		position: Entity.vec3({ x: 0, y: 0, z }),
		focalLength,
		focusDistance: z,
		aperture: 0,
	});
};

export class Runner extends Context.Service<Runner>()("Runner", {
	make: Effect.fnUntraced(function* (
		settings: Partial<Settings> = {},
		comp: CompConfig = defaultComp,
	) {
		const tree = new Tree();
		const phaser = yield* Phaser.Phaser.make;
		// concurrent branches spawned by Scene.fork / Scene.play /
		// Scene.background. `forks` hold the scene's end hostage until their
		// SEMANTIC end; a branch that finishes (or completes) is demoted to
		// `backgrounds`, which are interrupted at scene end.
		const forks = new Set<BranchEntry>();
		const backgrounds = new Set<BranchEntry>();
		// root party + un-finished forks — the work the scene's end must wait
		// for. Kept as a synchronous counter (updated in the same finalizers
		// that release phaser parties) so the frame consumer can decide
		// "scene over" without depending on the scene fiber being scheduled.
		let awaited = 0;
		// first NON-finished branch failure; failures in a tail (after
		// Scene.finish) are deliberately not reported
		let failure: Cause.Cause<unknown> | undefined;

		/**
		 * Mounted scenes, by the id of the group they mount under.
		 *
		 * A comp is a render-to-texture boundary — its own scene, render
		 * target, and identity camera — created ONLY by `Scene.play`. It used
		 * to be inferred from a Group carrying width/height, which duplicated
		 * what the child Scene already owned and made "is this a comp" a
		 * question about field presence. It is now declared here explicitly.
		 */
		const comps = new Map<string, CompConfig>();

		const setDataUnsafe = <Tag extends Entity.EntityTag>(
			instance: Instance.Instance<Tag>,
			state: Entity.EntityByTag<Tag>,
		): void => {
			const entry = tree.getEntry(instance.id) ?? nodeNotFound(instance.id);
			entry.state = state;
		};

		const getDataUnsafe = <Tag extends Entity.EntityTag>(
			instance: Instance.Instance<Tag>,
		): Entity.EntityByTag<Tag> | null => {
			const entry = tree.getEntry(instance.id);
			if (entry === null) {
				return null;
			}
			// the instance's tag names the entry's state; the tree stores mixed
			// tags, so this is the one place the two are reconciled
			return entry.state as Entity.EntityByTag<Tag>;
		};

		const resolvedSettings = {
			...settings,
			frameRate: settings.frameRate ?? 60,
			seed: settings.seed ?? defaultSeed,
			maxFrames: settings.maxFrames ?? 36_000,
		} satisfies Settings;

		// the root group: never rendered itself, holds the top level. Its
		// entry is created by the tree itself.
		const root: GroupInstance = Instance.makeInstance(ROOT_ID, "Group");

		// the active camera: an ordinary tree node (so the animators drive it),
		// never rendered. A default resting camera is present from the start,
		// so depth/zoom work with no author ceremony; `setCamera` swaps which
		// instance is active.
		tree.createNode(identityCamera(comp.width), "camera");
		const camera: Instance.Instance<"Camera"> = Instance.makeInstance(
			"camera",
			"Camera",
		);
		let activeCameraId = camera.id;
		const cameraState = (): Projection.CameraView &
			Projection.PointOfInterest => {
			const entry = tree.getEntry(activeCameraId);
			// a destroyed (or swapped-to-non-camera) active camera falls back to
			// the resting view rather than dying: the view is not scene-critical
			if (entry === null || entry.state._tag !== "Camera") {
				return toCameraView(identityCamera(comp.width));
			}
			return toCameraView(entry.state);
		};

		// move `child` under `parent`: the tree detaches it from its current
		// parent first, so it is never double-referenced.
		const appendChild = (
			parent: GroupInstance,
			child: Instance.Instance,
		): void => {
			const childEntry = tree.getEntry(child.id);
			if (childEntry === null) {
				throw new Error(`Runner: child "${child.id}" was destroyed`);
			}
			tree.appendChild(parent.id, childEntry);
		};

		const removeChild = (
			parent: GroupInstance,
			child: Instance.Instance,
		): void => {
			const entry = tree.getEntry(child.id);
			if (entry !== null && entry.parentId === parent.id) {
				tree.removeFromParent(entry);
			}
		};

		// normalize a polymorphic children list into stored child ids, in
		// order: a string → a Text; an Instance → its id; otherwise an
		// Effect<Instance> yielded here (JSX children need no yield*).
		const normalizeChildren = (
			children: ReadonlyArray<Child>,
		): Effect.Effect<Array<string>, never, Runner> =>
			Effect.gen(function* () {
				const ids: Array<string> = [];
				for (const child of children) {
					if (typeof child === "string") {
						const text = yield* self.instantiate("Text", { text: child });
						ids.push(text.id);
					} else if (Instance.isInstance(child)) {
						ids.push(child.id);
					} else {
						const resolved = yield* child;
						ids.push(resolved.id);
					}
				}
				return ids;
			});

		const self = {
			root,
			instantiate: Effect.fnUntraced(function* <Tag extends Entity.EntityTag>(
				kind: Tag,
				props: InstantiateProps<Tag>,
			): Effect.fn.Return<Instance.Instance<Tag>, never, Runner> {
				const raw = props as Record<string, unknown>;
				const children = Array.isArray(raw.children)
					? (raw.children as ReadonlyArray<Child>)
					: [];
				const childIds =
					children.length > 0 ? yield* normalizeChildren(children) : undefined;

				// cameras get width-relative z/focalLength defaults filled here
				// (AE's 50mm equivalent): the schema cannot default them because
				// only the Runner knows the comp width. Filled for EVERY Camera,
				// not just the built-in one, so a setCamera swap never jumps zoom.
				const defaults =
					kind === "Camera" ? cameraDefaults(raw, comp.width) : undefined;

				// raw children never reach stored data: normalized ids are
				// appended through the tree below, in list order
				const { children: _children, ...rest } = raw;
				const definition = Entity.getEntityDefinitionByTag(kind);
				const state = definition.make({
					...rest,
					...defaults,
				} as never) as Entity.Entity;

				const entry = tree.createNode(state);
				const instance = Instance.makeInstance(entry.id, kind);

				// cameras are view state, not scene content: they live in the tree
				// so the animators drive them, but must NOT be mounted under a
				// group. Everything else mounts under the ambient parent.
				if (kind !== "Camera") {
					const ambient = yield* CurrentParent;
					tree.appendChild((ambient ?? root).id, entry);
				}
				// adopt listed children: they were attached to the ambient parent
				// at birth; appendChild moves each under this instance in order
				if (childIds !== undefined) {
					for (const childId of childIds) {
						tree.appendChild(entry, childId);
					}
				}

				return instance;
			}),
			// move `child` under `parent` (detaching from its current parent
			// first, so it is never double-referenced). Instances are born
			// attached to the ambient parent; this reparents them.
			appendChild,
			// detach `child` from `parent` (no-op unless currently its child),
			// leaving it detached from the tree (still alive, just unmounted)
			removeChild,
			settings: resolvedSettings,
			// the root scene's composition config (resolution + background)
			comp,
			getDataUnsafe,

			setDataUnsafe,

			state: Effect.sync(() => {
				// the active camera lives in the tree so the animators drive it,
				// but it is view state, not a renderable instance — omit it from
				// the frame's instance map (its data is surfaced as `camera`)
				const instances: Record<string, { data: Entity.Entity }> = {};
				for (const [id, entry] of Object.entries(tree.map)) {
					if (id === activeCameraId) {
						continue;
					}
					instances[id] = { data: entry.state };
				}
				return {
					instances,
					root: ROOT_ID,
					frameRate: resolvedSettings.frameRate,
					width: comp.width,
					height: comp.height,
					backgroundColor: comp.backgroundColor,
					camera: cameraState(),
					// mounted scenes, by mount-group id: the renderer reads this
					// to know a subtree is a render-to-texture boundary, instead
					// of inferring it from a group carrying a size
					comps: Object.fromEntries(comps),
				};
			}),

			/**
			 * ponytail: create a tree node for an entity that is NOT in the
			 * union — the particle system only (design D10). Mounts under the
			 * ambient parent like any instance. Delete with the particles
			 * rewrite; see `particlesEscapeInstantiate`.
			 */
			instantiateEscape: Effect.fnUntraced(function* (state: Entity.Entity) {
				const entry = tree.createNode(state);
				const ambient = yield* CurrentParent;
				tree.appendChild((ambient ?? root).id, entry);
				return Instance.makeInstance(entry.id, state._tag);
			}),

			// declare the group at `id` to be a mounted scene with these bounds
			// (see `comps`); called by Scene.play, never by authors
			registerComp: (id: string, config: CompConfig): void => {
				comps.set(id, config);
			},
			// the bounds of the mounted scene at `id`, or null if it is a plain
			// group. Never inferred from fields — a comp is declared.
			compBounds: (id: string): CompConfig | null => comps.get(id) ?? null,

			// the default resting camera (animate it, or swap via setCamera)
			camera,
			// swap the active camera to another instance; its live data becomes
			// the view on every subsequent frame
			setCamera: (instance: Instance.Instance<"Camera">): void => {
				activeCameraId = instance.id;
			},

			destroy: (instance: Instance.Instance): void => {
				// double-destroy is a no-op, like the old map-based delete
				if (tree.getEntry(instance.id) === null) {
					return;
				}
				tree.remove(instance.id);
			},
			phaser,
			forks,
			backgrounds,
			countAwaited: (n: number): void => {
				awaited += n;
			},
			awaitedCount: (): number => awaited,
			recordFailure: (cause: Cause.Cause<unknown>): void => {
				failure = failure ?? cause;
			},
			failureCause: (): Cause.Cause<unknown> | undefined => failure,
		};
		return self;
	}),
}) {}

/**
 * Width-relative camera defaults the schema cannot express, since only the
 * Runner knows the comp width. Applied to any Camera at instantiate.
 */
const cameraDefaults = (
	props: Record<string, unknown>,
	width: number,
): Record<string, unknown> => {
	const position = props.position as Entity.Vec3 | undefined;
	const focalLength =
		typeof props.focalLength === "number" && props.focalLength !== 0
			? props.focalLength
			: Projection.defaultFocalLength(width);
	const restingZ = Projection.defaultCameraZ(focalLength);
	return {
		focalLength,
		position: Entity.vec3({
			x: position?.x ?? 0,
			y: position?.y ?? 0,
			z: position?.z ?? restingZ,
		}),
		// depth of field: focus at the resting distance by default, so the
		// z=0 plane is sharp for an untouched camera
		focusDistance:
			typeof props.focusDistance === "number" && props.focusDistance !== 0
				? props.focusDistance
				: restingZ,
	};
};

export const layer = Layer.effect(Runner, Runner.make());

// ── the particles escape hatch (design D10) ──────────────────────────────
//
// ponytail: the particle system is NOT a member of the entity union. It is
// slated for a full rewrite, so porting its 744 lines to a model it will not
// keep would be throwaway work — but six example scenes depend on it, so it
// cannot simply be deleted either.
//
// These three functions are the entire seam. They are deliberately ugly and
// deliberately greppable: every one names ParticleField, so `grep -r
// particlesEscape` finds all of it. Upgrade path: fold ParticleField into
// the union (or justify its exclusion) as part of the particles rewrite, then
// delete this block.

/** the shape particles store — opaque, as far as the union is concerned */
type ParticlesState = Record<string, unknown>;

/** the tag particle fields are stored under; never a union member */
export const PARTICLE_FIELD_TAG = "particles/ParticleField";

/** instantiate a non-union entity. Particles only. */
export const particlesEscapeInstantiate = (
	runner: Runner["Service"],
	state: ParticlesState,
): Effect.Effect<Instance.Instance, never, Runner> =>
	// bypasses the tag→EntityMap lookup, which by construction has no
	// ParticleField. The state is stored verbatim; only particles read it.
	runner.instantiateEscape({
		...state,
		_tag: PARTICLE_FIELD_TAG,
	} as unknown as Entity.Entity);

/** read a non-union entity's state. Particles only. */
export const particlesEscapeRead = <T>(
	runner: Runner["Service"],
	instance: Instance.Instance,
): T | null => runner.getDataUnsafe(instance) as unknown as T | null;

/** write a non-union entity's state. Particles only. */
export const particlesEscapeWrite = <T>(
	runner: Runner["Service"],
	instance: Instance.Instance,
	state: T,
): void =>
	runner.setDataUnsafe(
		instance,
		state as unknown as Entity.EntityByTag<Entity.EntityTag>,
	);
