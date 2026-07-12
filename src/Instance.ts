import * as Pipeable from "effect/Pipeable";
import type * as Schema from "effect/Schema";
import type * as Entity from "./Entity";

export const TypeId = "~motion/Instance" as const;

export interface Instance<
	Name extends string = string,
	Data extends Schema.Top = Schema.Top,
> extends Pipeable.Pipeable {
	readonly [TypeId]: typeof TypeId;
	readonly id: string;
	readonly entity: Entity.Entity<Name, Data>;
}

const Proto = {
	[TypeId]: TypeId,
	pipe(this: unknown) {
		// biome-ignore lint/style/noArguments: Pipeable's variadic protocol
		return Pipeable.pipeArguments(this, arguments);
	},
};

export const make = <Name extends string, Data extends Schema.Top>(
	entity: Entity.Entity<Name, Data>,
	id: string,
): Instance<Name, Data> => Object.assign(Object.create(Proto), { id, entity });
