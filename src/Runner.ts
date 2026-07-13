import { Layer } from "effect";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Schema from "effect/Schema";
import type * as Entity from "./Entity";
import * as Instance from "./Instance";
import * as Phaser from "./Phaser";
import { Group } from "./shapes/Group";

export const TypeId = "~motion/SceneRunner" as const;

/** conventional id of the implicit root group every instance attaches to */
export const ROOT_ID = "root";

export type Seed = number | string;

/** the fixed default: scenes are deterministic even with no seed set */
export const defaultSeed: Seed = "effect-motion";

export type Settings = {
	frameRate: number;
	/**
	 * seeds the scene's pseudo-random service (effect's Random via
	 * withSeed); the fixed default keeps default-constructed scenes
	 * byte-identical across runs. Note: the generator algorithm belongs
	 * to effect, so upgrading effect may change seeded sequences.
	 */
	seed: Seed;
};

export type GroupInstance = Instance.Of<typeof Group>;

export interface InstantiateOptions {
	/** the group to attach the new instance to; defaults to the root */
	readonly parent?: GroupInstance;
}

export class Runner extends Context.Service<Runner>()("Runner", {
	make: Effect.fnUntraced(function* (settings: Partial<Settings> = {}) {
		const instances: Record<
			string,
			{ data: unknown; entity: Entity.AnyEntity }
		> = {};
		const phaser = yield* Phaser.Phaser.make;
		let idCounter = 0;
		const generateId = (name: string) => {
			return `${name}_${idCounter++}`;
		};

		const setDataUnsafe = <Name extends string, Data extends Schema.Top>(
			instance: Instance.Instance<Name, Data>,
			data: Data["~type.make.in"],
		): void => {
			instances[instance.id] = {
				data: instance.entity.data.make(data),
				entity: instance.entity,
			};
		};

		const getDataUnsafe = <Name extends string, Data extends Schema.Top>(
			instance: Instance.Instance<Name, Data>,
		): Data["Type"] | null => {
			return (instances[instance.id]?.data as Data["Type"]) ?? null;
		};

		// the root group: never rendered itself, holds the top level
		const root: GroupInstance = Instance.make(Group, ROOT_ID);
		setDataUnsafe(root, {});

		const attach = (parent: GroupInstance, id: string): void => {
			const data = getDataUnsafe(parent);
			if (data === null) {
				throw new Error(`Runner: parent group "${parent.id}" was destroyed`);
			}
			setDataUnsafe(parent, { ...data, children: [...data.children, id] });
		};

		return {
			root,
			instantiate: Effect.fnUntraced(function* <
				Name extends string,
				Data extends Schema.Top,
				Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
			>(
				entity: Entity.Entity<Name, Data, Traits>,
				props: Data["~type.make.in"],
				options?: InstantiateOptions,
			): Effect.fn.Return<
				Instance.Instance<Name, Data, Traits>,
				void,
				Entity.Entity<Name, Data, Traits>
			> {
				const id = generateId(entity.name);
				const instance = Instance.make(entity, id);
				setDataUnsafe(instance, props);
				attach(options?.parent ?? root, id);

				return instance;
			}),
			settings: {
				...settings,
				frameRate: settings.frameRate ?? 60,
				seed: settings.seed ?? defaultSeed,
			} satisfies Settings,
			getDataUnsafe,

			setDataUnsafe,

			state: Effect.sync(() => ({
				instances: { ...instances },
				root: ROOT_ID,
			})),

			destroy: <Name extends string, Data extends Schema.Top>(
				instance: Instance.Instance<Name, Data>,
			): void => {
				delete instances[instance.id];
				// detach from whichever group references it — a full scan stays
				// correct even after manual reparenting via data updates
				for (const [id, entry] of Object.entries(instances)) {
					const children = (entry.data as { children?: unknown }).children;
					if (Array.isArray(children) && children.includes(instance.id)) {
						instances[id] = {
							entity: entry.entity,
							data: entry.entity.data.make({
								...(entry.data as object),
								children: children.filter((child) => child !== instance.id),
							}),
						};
					}
				}
			},
			phaser,
		};
	}),
}) {}

export const layer = Layer.effect(Runner, Runner.make());
