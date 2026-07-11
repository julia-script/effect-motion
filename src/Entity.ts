import * as Schema from "effect/Schema";
import type { AnyStructSchema } from "effect/unstable/workflow/Workflow";

const TypeId = "~motion/Entity" as const;

export interface Entity<
	Name extends string = string,
	Data extends Schema.Top = Schema.Top,
> {
	readonly [TypeId]: typeof TypeId;
	readonly name: Name;

	readonly data: Data;
}

type NormalizeStructLike<T extends Schema.Struct.Fields | AnyStructSchema> =
	T extends AnyStructSchema
		? T
		: T extends Schema.Struct.Fields
			? Schema.Struct<T>
			: never;
const normalizeStructLike = <T extends Schema.Struct.Fields | AnyStructSchema>(
	data: T,
): NormalizeStructLike<T> => {
	return (
		Schema.isSchema(data) ? data : Schema.Struct(data)
	) as NormalizeStructLike<T>;
};
export const make = <
	Name extends string,
	Data extends Schema.Struct.Fields | AnyStructSchema,
>(
	name: Name,
	data: Data,
): Entity<Name, NormalizeStructLike<Data>> => {
	return {
		[TypeId]: TypeId,
		name,
		data: normalizeStructLike(data),
	};
};
