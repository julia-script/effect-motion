import * as Schema from "effect/Schema";
import type { AnyStructSchema } from "effect/unstable/workflow/Workflow";

export const TypeId = "~motion/Entity" as const;

/**
 * A trait is a complete get/set lens over the entity's data — all or
 * nothing: a lone getter or setter is unrepresentable. `set` receives
 * the whole data and returns a new immutable whole with the change
 * applied, so each entity owns its semantics (e.g. Line's position
 * translates both endpoints).
 */
export interface TraitLens<Data, Value> {
	readonly get: (data: Data) => Value;
	readonly set: (data: Data, value: Value) => Data;
}

/** a type alias (not interface) so it satisfies Record constraints */
export type Position = {
	readonly x: number;
	readonly y: number;
};

export type EntityTraits<Data> = {
	readonly "~position": TraitLens<Data, Position>;
	readonly "~opacity": TraitLens<Data, number>;
};

export type TraitKey = keyof EntityTraits<unknown>;

export interface Entity<
	Name extends string = string,
	Data extends Schema.Top = Schema.Top,
	Traits extends Partial<EntityTraits<Data["Type"]>> = {},
> {
	readonly [TypeId]: typeof TypeId;
	readonly name: Name;
	readonly data: Data;
	readonly traits: Traits;
}

export type AnyEntity = Entity<any, any, any>;

/** the entity's trait lens, or a defect naming entity and trait */
export const traitOrDie = <Data, Value>(
	entity: AnyEntity,
	key: TraitKey,
): TraitLens<Data, Value> => {
	const lens = (entity.traits as Partial<Record<TraitKey, unknown>>)[key];
	if (lens === undefined) {
		throw new Error(
			`Entity "${entity.name}" does not implement the "${key}" trait`,
		);
	}
	return lens as TraitLens<Data, Value>;
};

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
	const Traits extends Partial<
		EntityTraits<NormalizeStructLike<Data>["Type"]>
	> = {},
>(
	name: Name,
	data: Data,
	traits?: Traits,
): Entity<Name, NormalizeStructLike<Data>, Traits> => {
	const normalized = normalizeStructLike(data);
	// `$` is reserved for builtin, engine-owned instance properties (e.g.
	// `$visible`), which live beside the data — never as entity-data fields.
	for (const field of Object.keys(normalized.fields)) {
		if (field.startsWith("$")) {
			throw new Error(
				`Entity "${name}": field "${field}" uses the reserved "$" prefix (reserved for builtin instance properties like $visible)`,
			);
		}
	}
	return {
		[TypeId]: TypeId,
		name,
		data: normalized,
		traits: traits ?? ({} as Traits),
	};
};
