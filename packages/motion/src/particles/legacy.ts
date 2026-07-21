import { Predicate } from "effect";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

/**
 * ponytail: the pre-union entity machinery, kept alive for the particle
 * system ALONE (design D10).
 *
 * ParticleField is not a member of the closed entity union. It is slated for
 * a full rewrite, so porting it to a model it will not keep would be
 * throwaway work — but six example scenes depend on it, so it cannot be
 * deleted either. This file is the entire remnant of `Entity.ts` and
 * `shapes/Legacy.ts`, scoped to `particles/` and reachable from nowhere
 * else.
 *
 * Upgrade path: fold ParticleField into the union (or justify its
 * exclusion) as part of the particles rewrite, then delete this file.
 */

export const TypeId = "~motion/Entity" as const;

export interface TraitLens<Data, Value> {
	readonly get: (data: Data) => Value;
	readonly set: (data: Data, value: Value) => Data;
}

export type Position = {
	readonly x: number;
	readonly y: number;
	readonly z: number;
};

export type EntityTraits<Data> = {
	readonly "~position": TraitLens<Data, Position>;
	readonly "~opacity": TraitLens<Data, number>;
};

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

export const make = <
	Name extends string,
	Data extends Schema.Struct.Fields = {},
	const Traits extends PartialTraits<Data> = {},
>(
	name: Name,
	data: Data,
	traits?: Traits,
): Entity<Name, Data, Traits> => ({
	[TypeId]: TypeId,
	name,
	data: Schema.Struct({
		...data,
		"~visible": Schema.Boolean.pipe(
			Schema.withConstructorDefault(Effect.succeed(true)),
		),
	}),
	traits: traits ?? ({} as Traits),
});

export const is = (u: unknown): u is Entity<string, {}, {}> =>
	Predicate.hasProperty(u, TypeId);

// ── the Shape2D field helpers particles use ──────────────────────────────

export const defaultedNumber = (value: number) =>
	Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(value)));

export const position = {
	x: defaultedNumber(0),
	y: defaultedNumber(0),
	z: defaultedNumber(0),
};

export const opacity = {
	opacity: defaultedNumber(1),
};

export const positionLens = <
	Data extends { x: number; y: number; z: number },
>(): TraitLens<Data, Position> => ({
	get: (data) => ({ x: data.x, y: data.y, z: data.z }),
	set: (data, value) =>
		({ ...data, x: value.x, y: value.y, z: value.z }) as Data,
});

export const opacityLens = <Data extends { opacity: number }>(): TraitLens<
	Data,
	number
> => ({
	get: (data) => data.opacity,
	set: (data, opacity) => ({ ...data, opacity }) as Data,
});
