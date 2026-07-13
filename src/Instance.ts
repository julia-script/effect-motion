import * as Pipeable from "effect/Pipeable";
import type * as Schema from "effect/Schema";
import type * as Entity from "./Entity";

export const TypeId = "~motion/Instance" as const;

export interface Instance<
	Name extends string = string,
	Data extends Schema.Top = Schema.Top,
	Traits extends Partial<Entity.EntityTraits<Data["Type"]>> = {},
> extends Pipeable.Pipeable {
	readonly [TypeId]: typeof TypeId;
	readonly id: string;
	readonly entity: Entity.Entity<Name, Data, Traits>;
}

/** the Instance type of a given entity, traits included */
export type Of<E extends Entity.AnyEntity> =
	E extends Entity.Entity<infer Name, infer Data, infer Traits>
		? Instance<Name, Data, Traits>
		: never;

export const isInstance = (u: unknown): u is Instance =>
	typeof u === "object" && u !== null && TypeId in u;

const Proto = {
	[TypeId]: TypeId,
	pipe(this: unknown) {
		// biome-ignore lint/style/noArguments: Pipeable's variadic protocol
		return Pipeable.pipeArguments(this, arguments);
	},
};

export const make = <
	Name extends string,
	Data extends Schema.Top,
	Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
>(
	entity: Entity.Entity<Name, Data, Traits>,
	id: string,
): Instance<Name, Data, Traits> =>
	Object.assign(Object.create(Proto), { id, entity });
