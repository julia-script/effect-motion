import type * as Schema from "effect/Schema";
import type * as Entity from "./Entity";

export const TypeId = "~motion/Instance" as const;

export interface Instance<
	Name extends string = string,
	Data extends Schema.Top = Schema.Top,
> {
	readonly [TypeId]: typeof TypeId;
	readonly id: string;
	readonly entity: Entity.Entity<Name, Data>;
}

export const make = <Name extends string, Data extends Schema.Top>(
	entity: Entity.Entity<Name, Data>,
	id: string,
): Instance<Name, Data> => {
	return {
		[TypeId]: TypeId,
		id: id,
		entity: entity,
	};
};
