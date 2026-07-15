import * as Effect from "effect/Effect";
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
	readonly entity: Entity.Entity<Name, Data, Traits, any>;
}

/** the Instance type of a given entity, traits included */
export type Of<E extends Entity.AnyEntity> =
	E extends Entity.Entity<infer Name, infer Data, infer Traits, any>
		? Instance<Name, Data, Traits>
		: never;

export const isInstance = (u: unknown): u is Instance =>
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
	Data extends Schema.Top,
	Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
	MakeInput,
>(
	entity: Entity.Entity<Name, Data, Traits, MakeInput>,
	id: string,
): Instance<Name, Data, Traits> =>
	Object.assign(Object.create(Proto), { id, entity });

export type InstanceOrEffect<
	Name extends string = string,
	Data extends Schema.Top = Schema.Top,
	Traits extends Partial<Entity.EntityTraits<Data["Type"]>> = {},
	E = never,
	R = never,
> =
	| Instance<Name, Data, Traits>
	| Effect.Effect<Instance<Name, Data, Traits>, E, R>;

export const flatten = <
	Name extends string,
	Data extends Schema.Top,
	Traits extends Partial<Entity.EntityTraits<Data["Type"]>>,
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
