import { Layer } from "effect";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Schema from "effect/Schema";
import type * as Entity from "./Entity";
import * as Instance from "./Instance";
import * as Phaser from "./Phaser";

export const TypeId = "~motion/SceneRunner" as const;
export type Settings = {
	frameRate: number;
};

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
		return {
			instantiate: Effect.fnUntraced(function* <
				Name extends string,
				Data extends Schema.Top,
			>(
				entity: Entity.Entity<Name, Data>,
				props: Data["~type.make.in"],
			): Effect.fn.Return<
				Instance.Instance<Name, Data>,
				void,
				Entity.Entity<Name, Data>
			> {
				const id = generateId(entity.name);
				const instance = Instance.make(entity, id);
				setDataUnsafe(instance, props);

				return instance;
			}),
			settings: {
				...settings,
				frameRate: settings.frameRate ?? 60,
			} satisfies Settings,
			getDataUnsafe,

			setDataUnsafe,

			state: Effect.sync(() => ({ instances: { ...instances } })),

			destroy: <Name extends string, Data extends Schema.Top>(
				instance: Instance.Instance<Name, Data>,
			): void => {
				delete instances[instance.id];
			},
			phaser,
		};
	}),
}) {}

export const layer = Layer.effect(Runner, Runner.make());
