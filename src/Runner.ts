import { Layer } from "effect";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Schema from "effect/Schema";
import type * as Entity from "./Entity";
import * as Instance from "./Instance";
import * as Phaser from "./Phaser";

export const TypeId = "~motion/SceneRunner" as const;

export class Runner extends Context.Service<Runner>()("Runner", {
	make: Effect.fnUntraced(function* () {
		const instances: Record<string, unknown> = {};
		const phaser = yield* Phaser.Phaser.make;
		let idCounter = 0;
		const generateId = () => {
			return `id-${idCounter++}`;
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
				const id = generateId();
				const instance = Instance.make(entity, id);
				instances[instance.id] = props;
				return instance;
			}),
			getDataUnsafe: <Name extends string, Data extends Schema.Top>(
				instance: Instance.Instance<Name, Data>,
			): Data["Type"] | null => {
				return instances[instance.id] as Data["Type"] | null;
			},

			setDataUnsafe: <Name extends string, Data extends Schema.Top>(
				instance: Instance.Instance<Name, Data>,
				data: Data["~type.make.in"],
			): boolean => {
				if (instances[instance.id]) {
					instances[instance.id] = instance["~data.schema"].make(data);
					return true;
				}
				return false;
			},
			state: Effect.sync(() => ({ ...instances })),
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
