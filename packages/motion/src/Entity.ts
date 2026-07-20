import { Effect, Predicate } from "effect";
import * as Schema from "effect/Schema";

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

/**
 * a type alias (not interface) so it satisfies Record constraints.
 * Position is 3D: `z` is depth (0 = the screen plane). 2D shapes default
 * z to 0 and read as plain-2D; the camera projects x/y/z to screen.
 */
export type Position = {
	readonly x: number;
	readonly y: number;
	readonly z: number;
};

export type EntityTraits<Data> = {
	readonly "~position": TraitLens<Data, Position>;
	readonly "~opacity": TraitLens<Data, number>;
};

export type TraitKey = keyof EntityTraits<unknown>;

export type EntityData<Data extends Schema.Struct.Fields> = Schema.Struct<
	Data & {
		readonly "~visible": Schema.withConstructorDefault<Schema.Boolean>;
	}
>;
export type PartialTraits<Data extends Schema.Struct.Fields> = Partial<
	EntityTraits<EntityData<Data>["Type"]>
>;
export interface Entity<
	Name extends string = string,
	Data extends Schema.Struct.Fields = {},
	Traits extends PartialTraits<Data> = {},
> {
	readonly [TypeId]: typeof TypeId;
	readonly name: Name;
	readonly data: EntityData<Data>;
	readonly traits: Traits;
}

export type AnyEntity = Entity<string, {}, {}>;

/** the entity's trait lens, or a defect naming entity and trait */
export const traitOrDie = <Data, Value>(
	// structural minimum, not AnyEntity: generic Fields-typed entities must
	// pass through without variance fights — only name/traits are read
	entity: { readonly name: string; readonly traits: unknown },
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

export const make = <
	Name extends string,
	Data extends Schema.Struct.Fields = {},
	const Traits extends PartialTraits<Data> = {},
>(
	name: Name,
	data: Data,
	traits?: Traits,
): Entity<Name, Data, Traits> => {
	return {
		[TypeId]: TypeId,
		name,
		data: Schema.Struct({
			...data,
			"~visible": Schema.Boolean.pipe(
				Schema.withConstructorDefault(Effect.succeed(true)),
			),
		}),
		traits: traits ?? ({} as Traits),
	};
};

export const is = (u: unknown): u is Entity<string, {}, {}> => {
	if (!Predicate.hasProperty(u, TypeId)) {
		return false;
	}
	return true;
};

export const isEntity = <
	Name extends string,
	Data extends Schema.Struct.Fields,
	Traits extends PartialTraits<Data>,
>(
	entity: Entity<Name, Data, Traits>,
	u: unknown,
): u is Entity<Name, Data, Traits> => {
	if (!is(u)) {
		return false;
	}
	return u.name === entity.name;
};
