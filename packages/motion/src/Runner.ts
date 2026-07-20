import { Layer } from "effect";
import type * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Fiber from "effect/Fiber";
import type * as Schema from "effect/Schema";
import * as Camera from "./Camera.js";
import * as Color from "./Color.js";
import * as Entity from "./Entity.js";
import * as Instance from "./Instance.js";
import * as Phaser from "./Phaser.js";
import * as Projection from "./Projection.js";
import * as Group from "./shapes/Group.js";
import * as Text from "./shapes/Text.js";

export const TypeId = "~motion/SceneRunner" as const;

/** conventional id of the implicit root group every instance attaches to */
export const ROOT_ID = "root";

export type Seed = number | string;

/** the fixed default: scenes are deterministic even with no seed set */
export const defaultSeed: Seed = "effect-motion";

/**
 * Playback settings — how the movie RUNS. What the movie IS (resolution,
 * background) lives on the root scene as its composition config.
 */
export type Settings = {
	frameRate: number;
	/**
	 * seeds the scene's pseudo-random service (effect's Random via
	 * withSeed); the fixed default keeps default-constructed scenes
	 * byte-identical across runs. Note: the generator algorithm belongs
	 * to effect, so upgrading effect may change seeded sequences.
	 */
	seed: Seed;
	/**
	 * hard cap on frames a scene may produce (default 36_000 — 10 minutes
	 * at 60fps): a scene that exceeds it dies instead of hanging the
	 * consumer. Set to `Infinity` to declare an intentionally infinite
	 * scene.
	 */
	maxFrames: number;
};

/**
 * A scene's composition config, After Effects–style: what the comp IS.
 * The runner inherits the ROOT scene's config; a nested scene keeps its
 * own as its bounds (see Scene.play).
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

export type GroupInstance = Instance.Of<typeof Group.Group>;

/**
 * A child in a polymorphic `children` list: a plain string (→ a `Text`),
 * an already-created `Instance`, or an `Effect` that resolves to one (a
 * not-yet-yielded `instantiate` — yielded internally so JSX children need
 * no `yield*`). Normalized to a stored child id in list order.
 * `AnyInstance` on purpose: concrete (and branded, e.g. particle-field)
 * instances must pass without variance fights.
 */
export type Child =
	| string
	| Instance.AnyInstance
	| Effect.Effect<Instance.AnyInstance, never, Runner>;

/**
 * The input `instantiate` accepts: the entity's own make-input, except that
 * a `children` field (stored as `Array<string>` of ids) is authored as the
 * polymorphic {@link Child} list — the runner normalizes it to ids in list
 * order. Entities without a `children` field take their make-input as-is.
 */
export type InstantiateProps<Data extends Schema.Struct.Fields> =
	"children" extends keyof Entity.EntityData<Data>["~type.make.in"]
		? Omit<Entity.EntityData<Data>["~type.make.in"], "children"> & {
				readonly children?: ReadonlyArray<Child>;
			}
		: Entity.EntityData<Data>["~type.make.in"];

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

const getChildren = (props: Record<string, unknown>): ReadonlyArray<Child> => {
	if ("children" in props) {
		return props.children as ReadonlyArray<Child>;
	}
	return [];
};

class Entry<
	Entity extends Entity.Entity<string, any, any> = Entity.Entity<
		string,
		any,
		any
	>,
> {
	parentId: string | null = null;
	constructor(
		public readonly id: string,
		public readonly entity: Entity,
		public data: Entity["data"]["Type"],
	) {}

	static make = <Entity extends Entity.Entity<string, any, any>>(
		id: string,
		entity: Entity,
		data: Entity["data"]["~type.make.in"],
	): Entry<Entity> => {
		const entry = new Entry(id, entity, {});
		entry.setData(data);
		return entry;
	};

	getChildren = (): ReadonlyArray<string> | null => {
		return this.data.children ?? null;
	};

	setData = (data: Entity["data"]["~type.make.in"]): void => {
		this.data = this.entity.data.make(data);
	};
	static is = <Entity extends Entity.Entity<string, any, any>>(
		entity: Entity,
		entry: Entry<any>,
	): entry is Entry<Entity> => {
		return entry.entity === entity;
	};
}

type Entryish = Entry<Entity.Entity<string, any, any>> | string;
const nodeNotFound = (entry: Entryish): never => {
	throw new Error(
		`Runner: node "${typeof entry === "string" ? entry : entry.id}" not found`,
	);
};
class RunnerTree {
	idCounter = 0;
	map: Record<string, Entry<any>> = {
		[ROOT_ID]: Entry.make(ROOT_ID, Group.Group, {}),
	};

	createNode = <
		Entity extends Entity.Entity<string, any, any> = Entity.Entity<
			string,
			any,
			any
		>,
	>(
		entity: Entity,
		data: Entity["data"]["~type.make.in"],
		// engine-owned singletons (the built-in camera) claim a fixed id
		id: string = `${entity.name}_${this.idCounter++}`,
	): Entry<Entity> => {
		const entry = Entry.make<Entity>(id, entity, data);
		this.map[entry.id] = entry;
		return entry;
	};

	getEntry = (id: Entryish): Entry<Entity.Entity<string, any, any>> | null => {
		const entry = this.map[typeof id === "string" ? id : id.id];
		return entry ?? null;
	};

	// frames snapshot `entry.data` by reference, so child-list updates must
	// go through setData (fresh object) — mutating data in place would
	// rewrite already-emitted frames.
	private setChildren = (
		parentEntry: Entry<Entity.Entity<string, any, any>>,
		children: ReadonlyArray<string>,
	): void => {
		parentEntry.setData({ ...parentEntry.data, children });
	};

	removeFromParent = (entryish: Entryish): void => {
		const entry = this.getEntry(entryish) ?? nodeNotFound(entryish);
		if (entry.parentId === null) {
			return;
		}
		// a parent that was itself removed: nothing to filter, just detach
		const parentEntry = this.getEntry(entry.parentId);
		if (parentEntry !== null) {
			const children = parentEntry.getChildren();
			if (children === null) {
				throw new Error(
					`Runner: parent "${parentEntry.id}" cannot have children`,
				);
			}
			this.setChildren(
				parentEntry,
				children.filter((childId) => childId !== entry.id),
			);
		}
		entry.parentId = null;
	};

	appendChild = (parent: Entryish, child: Entryish) => {
		const childEntry = this.getEntry(child) ?? nodeNotFound(child);
		this.removeFromParent(childEntry);
		const parentEntry = this.getEntry(parent) ?? nodeNotFound(parent);
		const parentChildren = parentEntry.getChildren();
		if (parentChildren === null) {
			throw new Error(
				`Runner: parent "${parentEntry.id}" cannot have children`,
			);
		}
		this.setChildren(parentEntry, [...parentChildren, childEntry.id]);
		childEntry.parentId = parentEntry.id;
	};

	insertBefore = (childish: Entryish, beforeish: Entryish) => {
		const child = this.getEntry(childish) ?? nodeNotFound(childish);
		const beforeEntry = this.getEntry(beforeish) ?? nodeNotFound(beforeish);
		this.removeFromParent(child);
		if (beforeEntry.parentId === null) {
			throw new Error(`Runner: before "${beforeEntry.id}" is not a child`);
		}
		const parentEntry =
			this.getEntry(beforeEntry.parentId) ?? nodeNotFound(beforeEntry.parentId);
		const parentChildren = parentEntry.getChildren();
		if (parentChildren === null) {
			throw new Error(
				`Runner: parent "${parentEntry.id}" cannot have children`,
			);
		}
		const children: string[] = [];
		let inserted = false;
		for (const childId of parentChildren) {
			if (childId === beforeEntry.id) {
				children.push(child.id);
				inserted = true;
			}
			children.push(childId);
		}
		if (!inserted) children.push(child.id);

		this.setChildren(parentEntry, children);
		child.parentId = parentEntry.id;
	};

	remove = (entryish: Entryish): void => {
		const entry = this.getEntry(entryish) ?? nodeNotFound(entryish);
		this.removeFromParent(entry);
		delete this.map[entry.id];
		// orphan its children, and backstop-scan child lists: stays correct
		// even after manual reparenting via raw data updates (which bypass
		// parentId tracking)
		for (const other of Object.values(this.map)) {
			if (other.parentId === entry.id) {
				other.parentId = null;
			}
			const children = other.getChildren();
			if (children?.includes(entry.id)) {
				this.setChildren(
					other,
					children.filter((childId) => childId !== entry.id),
				);
			}
		}
	};
}

//
export class Runner extends Context.Service<Runner>()("Runner", {
	make: Effect.fnUntraced(function* (
		settings: Partial<Settings> = {},
		comp: CompConfig = defaultComp,
	) {
		const tree = new RunnerTree();
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

		const setDataUnsafe = <
			Name extends string,
			Data extends Schema.Struct.Fields,
			Traits extends Entity.PartialTraits<Data>,
		>(
			instance: Instance.Instance<Name, Data, Traits>,
			data: Entity.EntityData<Data>["Type"],
		): void => {
			const entry = tree.getEntry(instance.id) ?? nodeNotFound(instance.id);
			entry.setData(data);
		};

		const getDataUnsafe = <
			Name extends string,
			Data extends Schema.Struct.Fields,
			Traits extends Entity.PartialTraits<Data>,
		>(
			instance: Instance.Instance<Name, Data, Traits>,
		): Entity.EntityData<Data>["Type"] | null => {
			const entry = tree.getEntry(instance.id);
			if (entry === null) {
				return null;
			}
			return entry.data as Entity.EntityData<Data>["Type"];
		};

		const resolvedSettings = {
			...settings,
			frameRate: settings.frameRate ?? 60,
			seed: settings.seed ?? defaultSeed,
			maxFrames: settings.maxFrames ?? 36_000,
		} satisfies Settings;

		// the root group: never rendered itself, holds the top level. Its
		// entry is created by the tree itself.
		const root: GroupInstance = Instance.make(Group.Group, ROOT_ID);

		// the active camera: an ordinary tree node (so the animators drive it),
		// never registered with a sink so it never draws. A default identity
		// camera is present from the start, so `depth`/zoom work with no author
		// ceremony; `setCamera` swaps which instance is active.
		tree.createNode(Camera.Camera, Camera.identity(comp.width), "camera");
		const camera: Instance.Of<typeof Camera.Camera> = Instance.make(
			Camera.Camera,
			"camera",
		);
		let activeCameraId = camera.id;
		const cameraState = (): Camera.CameraState => {
			const data = tree.getEntry(activeCameraId)?.data as
				| Camera.CameraState
				| undefined;
			// a destroyed active camera falls back to identity rather than dying:
			// the view is not scene-critical state
			return data ?? Camera.identity(comp.width);
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
		): Effect.Effect<string[], never, Runner> =>
			Effect.gen(function* () {
				const ids: string[] = [];
				for (const child of children) {
					if (typeof child === "string") {
						const child$ = yield* self.instantiate(
							Text.Text,
							Text.Text.data.make({ text: child }),
						);
						ids.push(child$.id);
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
			instantiate: Effect.fnUntraced(function* <
				Name extends string,
				Data extends Schema.Struct.Fields,
				Traits extends Entity.PartialTraits<Data>,
			>(
				entity: Entity.Entity<Name, Data, Traits>,
				// make-input with polymorphic children: the runner makes the
				// stored data itself (via the tree entry), so raw props arrive
				// un-validated and children are normalized to ids here
				props: InstantiateProps<Data>,
			): Effect.fn.Return<
				Instance.Instance<Name, Data, Traits>,
				never,
				Runner
			> {
				const children = getChildren(props);
				const childIds =
					children.length > 0 ? yield* normalizeChildren(children) : undefined;

				// cameras get width-relative z/focalLength defaults filled here
				// (AE's 50mm equivalent — see Camera.ts): the schema can't default
				// them because only the Runner knows the scene width. Filling for
				// EVERY Camera instance (not just the built-in one) keeps a
				// setCamera swap from jumping zoom.
				const cameraDefaults = (() => {
					if (!Entity.isEntity(Camera.Camera, entity)) {
						return undefined;
					}
					const p = props as (typeof Camera.Camera)["data"]["Type"];
					const focalLength =
						p.focalLength ?? Projection.defaultFocalLength(comp.width);
					return {
						focalLength,
						z: p.z ?? focalLength,
						// depth of field: focus at the resting distance by default,
						// so the z=0 plane is sharp for an untouched camera
						focusDistance: p.focusDistance ?? focalLength,
					};
				})();
				// raw children never reach stored data: normalized ids are
				// appended through the tree below, in list order
				const { children: _children, ...rest } = props as Record<
					string,
					unknown
				>;
				const entry = tree.createNode(
					entity as Entity.Entity<string, any, any>,
					{ ...rest, ...cameraDefaults },
				);
				const instance = Instance.make(entity, entry.id);
				// cameras are view state, not scene content: they live in the tree
				// so the animators drive them, but must NOT be mounted under a
				// group (no sink renders a Camera — the renderer would die on the
				// unknown entity). Everything else mounts under the ambient parent
				// (Scene.play), defaulting to root.
				if (entity.name !== Camera.Camera.name) {
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
				// but it is view state, not a renderable instance — omit it from the
				// frame's instance map (its data is surfaced separately as `camera`)
				const renderable: Record<
					string,
					{
						data: {
							readonly "~visible": boolean;
							readonly [key: string]: unknown;
						};
						entity: Entity.Entity<string, any, any>;
					}
				> = {};
				for (const [id, entry] of Object.entries(tree.map)) {
					if (id === activeCameraId) {
						continue;
					}
					renderable[id] = { data: entry.data, entity: entry.entity };
				}
				return {
					instances: renderable,
					root: ROOT_ID,
					frameRate: resolvedSettings.frameRate,
					width: comp.width,
					height: comp.height,
					backgroundColor: comp.backgroundColor,
					camera: cameraState(),
				};
			}),

			// the default identity camera (animate it, or swap via setCamera)
			camera,
			// swap the active camera to another instance; its live data becomes
			// the view on every subsequent frame
			setCamera: (instance: Instance.Instance): void => {
				activeCameraId = instance.id;
			},

			destroy: <Name extends string, Data extends Schema.Struct.Fields>(
				instance: Instance.Instance<Name, Data>,
			): void => {
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

export const layer = Layer.effect(Runner, Runner.make());
