import { Layer } from "effect";
import type * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Fiber from "effect/Fiber";
import type * as Schema from "effect/Schema";
import { Camera, type CameraState, identity } from "./Camera";
import type * as Entity from "./Entity";
import * as Instance from "./Instance";
import * as Phaser from "./Phaser";
import * as Projection from "./Projection";
import { Group } from "./shapes/Group";
import { Text } from "./shapes/Text";

export const TypeId = "~motion/SceneRunner" as const;

/** conventional id of the implicit root group every instance attaches to */
export const ROOT_ID = "root";

export type Seed = number | string;

/** the fixed default: scenes are deterministic even with no seed set */
export const defaultSeed: Seed = "effect-motion";

export type Settings = {
	frameRate: number;
	/** output resolution — carried on every frame so renderers can size themselves */
	width: number;
	height: number;
	/** canvas background — carried on every frame so renderers can paint it (default a near-black, not pure #000) */
	backgroundColor: string;
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

export type GroupInstance = Instance.Of<typeof Group>;

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
 * Builtin, engine-owned instance properties — namespaced with `$` and
 * held BESIDE entity data, never in the entity schema. Every entity gets
 * them uniformly. `$visible` defaults to `true`.
 */
export interface BuiltinProps {
	readonly $visible?: boolean;
}

/**
 * The input accepted by `instantiate`: an entity's own make-input, plus
 * builtin props ($visible), plus — when the entity has a `children` field
 * — a polymorphic `children` list (strings/instances/effects) in place of
 * the stored `Array<string>` of ids.
 */
export type InstantiateProps<MakeInput> = Omit<MakeInput, "children"> &
	BuiltinProps &
	("children" extends keyof MakeInput
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

export class Runner extends Context.Service<Runner>()("Runner", {
	make: Effect.fnUntraced(function* (settings: Partial<Settings> = {}) {
		const instances: Record<
			string,
			{ data: unknown; entity: Entity.AnyEntity; $visible: boolean }
		> = {};
		// each instance's current parent group id (or null = detached / root).
		// Tracked so appendChild detaches from the old parent in O(1) rather
		// than scanning the tree. The root is not tracked (it has no parent).
		const parentOf: Record<string, string | null> = {};
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
		let idCounter = 0;
		const generateId = (name: string) => {
			return `${name}_${idCounter++}`;
		};

		const setDataUnsafe = <Name extends string, Data extends Schema.Top>(
			instance: Instance.Instance<Name, Data>,
			data: unknown,
		): void => {
			// preserve $visible across data updates; new instances default visible
			// ($visible is set explicitly by instantiate when overridden)
			const prev = instances[instance.id];
			instances[instance.id] = {
				data: instance.entity.data.make(data),
				entity: instance.entity,
				$visible: prev?.$visible ?? true,
			};
		};

		const setVisibleUnsafe = (id: string, visible: boolean): void => {
			const entry = instances[id];
			if (entry !== undefined) {
				instances[id] = { ...entry, $visible: visible };
			}
		};

		const getDataUnsafe = <Name extends string, Data extends Schema.Top>(
			instance: Instance.Instance<Name, Data>,
		): Data["Type"] | null => {
			return (instances[instance.id]?.data as Data["Type"]) ?? null;
		};

		const resolvedSettings = {
			...settings,
			frameRate: settings.frameRate ?? 60,
			width: settings.width ?? 500,
			height: settings.height ?? 300,
			backgroundColor: settings.backgroundColor ?? "#16161d",
			seed: settings.seed ?? defaultSeed,
			maxFrames: settings.maxFrames ?? 36_000,
		} satisfies Settings;

		// the root group: never rendered itself, holds the top level
		const root: GroupInstance = Instance.make(Group, ROOT_ID);
		setDataUnsafe(root, {});

		// the active camera: an ordinary instance (so the animators drive it),
		// never registered with a sink so it never draws. A default identity
		// camera is present from the start, so `depth`/zoom work with no author
		// ceremony; `setCamera` swaps which instance is active.
		const camera: Instance.Of<typeof Camera> = Instance.make(Camera, "camera");
		setDataUnsafe(camera, identity(resolvedSettings.width));
		let activeCameraId = camera.id;
		const cameraState = (): CameraState => {
			const data = instances[activeCameraId]?.data as CameraState | undefined;
			// a destroyed active camera falls back to identity rather than dying:
			// the view is not scene-critical state
			return data ?? identity(resolvedSettings.width);
		};

		// append `id` to a group's children and record it as the child's parent
		const attach = (parent: GroupInstance, id: string): void => {
			const data = getDataUnsafe(parent);
			if (data === null) {
				throw new Error(`Runner: parent group "${parent.id}" was destroyed`);
			}
			setDataUnsafe(parent, { ...data, children: [...data.children, id] });
			parentOf[id] = parent.id;
		};

		// remove `id` from its current parent's children (O(1) via parentOf),
		// leaving it detached. No-op if already detached or parent is gone.
		const detach = (id: string): void => {
			const parentId = parentOf[id];
			if (parentId == null) {
				return;
			}
			const parentEntry = instances[parentId];
			const children = (parentEntry?.data as { children?: unknown } | undefined)
				?.children;
			if (parentEntry !== undefined && Array.isArray(children)) {
				setDataUnsafe(
					{ id: parentId, entity: parentEntry.entity } as Instance.Instance,
					{
						...(parentEntry.data as object),
						children: children.filter((c) => c !== id),
					},
				);
			}
			parentOf[id] = null;
		};

		// move `child` under `parent`: detach from its current parent first
		// (so it is never double-referenced), then attach.
		const appendChild = (
			parent: GroupInstance,
			child: Instance.Instance,
		): void => {
			if (instances[child.id] === undefined) {
				throw new Error(`Runner: child "${child.id}" was destroyed`);
			}
			detach(child.id);
			attach(parent, child.id);
		};

		const removeChild = (
			parent: GroupInstance,
			child: Instance.Instance,
		): void => {
			if (parentOf[child.id] === parent.id) {
				detach(child.id);
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
						const child$ = yield* self.instantiate(Text, { text: child });
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
				Data extends Schema.Top,
				Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
			>(
				entity: Entity.Entity<Name, Data, Traits>,
				props: InstantiateProps<Data["~type.make.in"]>,
			): Effect.fn.Return<
				Instance.Instance<Name, Data, Traits>,
				never,
				Runner
			> {
				// peel off builtin ($visible) and polymorphic children before the
				// schema constructs the data — neither is an entity-data field
				// = props
				// children are born (via normalizeChildren) attached to their
				// ambient parent — reparent them into THIS instance below
				const childIds =
					"children" in props && props.children
						? yield* normalizeChildren(props.children)
						: undefined;
				// const dataInput =
				// 	childIds === undefined ? rest : { ...rest, children: childIds };

				const id = generateId(entity.name);
				const instance = Instance.make(entity, id);
				// cameras get width-relative z/focalLength defaults filled here
				// (AE's 50mm equivalent — see Camera.ts): the schema can't default
				// them because only the Runner knows the scene width. Filling for
				// EVERY Camera instance (not just the built-in one) keeps a
				// setCamera swap from jumping zoom.
				const cameraDefaults = (() => {
					if (entity.name !== Camera.name) {
						return undefined;
					}
					const p = props as {
						z?: number;
						focalLength?: number;
						focusDistance?: number;
					};
					const focalLength =
						p.focalLength ??
						Projection.defaultFocalLength(resolvedSettings.width);
					return {
						focalLength,
						z: p.z ?? focalLength,
						// depth of field: focus at the resting distance by default,
						// so the z=0 plane is sharp for an untouched camera
						focusDistance: p.focusDistance ?? focalLength,
					};
				})();
				setDataUnsafe(instance, {
					...props,
					...cameraDefaults,
					children: childIds,
				});
				if (props.$visible === false) {
					setVisibleUnsafe(id, false);
				}
				// cameras are view state, not tree nodes: they live in `instances`
				// so the animators drive them, but must NOT be mounted into the
				// render tree (no sink renders a Camera — the renderer would die on
				// the unknown entity). Everything else mounts under the ambient
				// parent (Scene.play), defaulting to root.
				if (entity.name !== Camera.name) {
					const ambient = yield* CurrentParent;
					attach(ambient ?? root, id);
				}
				// adopt listed children: they were attached to the ambient parent
				// at birth; detach them there and record this instance as parent
				// (their ids already live in this instance's `children` data)
				if (childIds !== undefined) {
					for (const childId of childIds) {
						detach(childId);
						parentOf[childId] = id;
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
			getDataUnsafe,

			setDataUnsafe,

			state: Effect.sync(() => {
				// the active camera lives in `instances` so the animators drive it,
				// but it is view state, not a renderable instance — omit it from the
				// frame's instance map (its data is surfaced separately as `camera`)
				const { [activeCameraId]: _camera, ...renderable } = instances;
				return {
					instances: renderable,
					root: ROOT_ID,
					frameRate: resolvedSettings.frameRate,
					width: resolvedSettings.width,
					height: resolvedSettings.height,
					backgroundColor: resolvedSettings.backgroundColor,
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

			destroy: <Name extends string, Data extends Schema.Top>(
				instance: Instance.Instance<Name, Data>,
			): void => {
				// O(1) detach from the tracked parent, then drop the instance
				detach(instance.id);
				delete instances[instance.id];
				delete parentOf[instance.id];
				// backstop scan: stays correct even after manual reparenting via
				// raw data updates (which bypass parentOf tracking)
				for (const [id, entry] of Object.entries(instances)) {
					const children = (entry.data as { children?: unknown }).children;
					if (Array.isArray(children) && children.includes(instance.id)) {
						instances[id] = {
							entity: entry.entity,
							$visible: entry.$visible,
							data: entry.entity.data.make({
								...(entry.data as object),
								children: children.filter((child) => child !== instance.id),
							}),
						};
					}
				}
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
