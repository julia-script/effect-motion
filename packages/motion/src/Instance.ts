import { Predicate } from "effect";
import * as Effect from "effect/Effect";
import * as Pipeable from "effect/Pipeable";
import type * as Schema from "effect/Schema";
import type * as Entity from "./Entity.js";
export const TypeId = "~motion/Instance" as const;

export interface Instance<
	Name extends string = string,
	Data extends Schema.Struct.Fields = {},
	Traits extends Entity.PartialTraits<Data> = {},
> extends Pipeable.Pipeable {
	readonly [TypeId]: typeof TypeId;
	readonly id: string;
	readonly entity: Entity.Entity<Name, Data, Traits>;
}

export type AnyInstance = Instance<any, any, any>;

/** the Instance type of a given entity, traits included */
export type Of<E> =
	E extends Entity.Entity<infer Name, infer Data, infer Traits>
		? Instance<Name, Data, Traits>
		: never;

export const isInstance = (u: unknown): u is { [TypeId]: typeof TypeId } =>
	typeof u === "object" && u !== null && TypeId in u;

const Proto = {
	[TypeId]: TypeId,
	pipe(this: unknown) {
		// biome-ignore lint: lint/style/noArguments: Pipeable's variadic protocol
		return Pipeable.pipeArguments(this, arguments);
	},
};

export const make = <
	Name extends string,
	Data extends Schema.Struct.Fields,
	Traits extends Entity.PartialTraits<Data>,
>(
	entity: Entity.Entity<Name, Data, Traits>,
	id: string,
): Instance<Name, Data, Traits> =>
	Object.assign(Object.create(Proto), { id, entity });

export type InstanceOrEffect<
	Name extends string = string,
	Data extends Schema.Struct.Fields = {},
	Traits extends Entity.PartialTraits<Data> = {},
	E = never,
	R = never,
> =
	| Instance<Name, Data, Traits>
	| Effect.Effect<Instance<Name, Data, Traits>, E, R>;

export const flatten = <
	Name extends string,
	Data extends Schema.Struct.Fields,
	Traits extends Entity.PartialTraits<Data>,
	E = never,
	R = never,
>(
	instance: InstanceOrEffect<Name, Data, Traits, E, R>,
): Effect.Effect<Instance<Name, Data, Traits>, E, R> => {
	if (isInstance(instance)) {
		return Effect.succeed(instance);
	}
	return instance;
};

export const is = (u: unknown): u is Instance<string, {}, {}> => {
	if (!Predicate.hasProperty(u, TypeId)) {
		return false;
	}
	return true;
};

export const isInstanceOf = <
	Name extends string = string,
	Data extends Schema.Struct.Fields = {},
	Traits extends Entity.PartialTraits<Data> = {},
>(
	entity: Entity.Entity<Name, Data, Traits>,
	instance: unknown,
): instance is Instance<Name, Data, Traits> => {
	if (!is(instance)) {
		return false;
	}
	return instance.entity.name === entity.name;
};
