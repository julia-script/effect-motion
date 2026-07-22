import * as Effect from "effect/Effect";
import * as Pipeable from "effect/Pipeable";
import type { EntityByTag, EntityTag } from "./Entity.js";

/**
 * An Instance is a REFERENCE to a live entity in the runner tree: an id and
 * the tag of what it is. It carries no entity data — the runner owns that —
 * so it stays a tiny, pipeable handle that animator chains flow through.
 */

/**
 * A reference to an entry in the runner tree: an id plus the tag of what it
 * is. Instances deliberately do NOT carry their entity definition — the tag
 * resolves it through {@link getEntityDefinitionByTag}, and the runner owns
 * the data.
 *
 * The `Tag` parameter is what keeps animators statically gated: an operation
 * needing `opacity` accepts `Instance<TagsWith<"opacity">>`, so the compiler
 * rejects a Camera. One string-literal parameter replaces the three-parameter
 * `Instance<Name, Data, Traits>` generic and its variance problems.
 */
export interface Instance<Tag extends EntityTag = EntityTag>
	extends Pipeable.Pipeable {
	readonly _tag: "Instance";
	readonly id: string;
	readonly kind: Tag;
}

/**
 * Instances are Pipeable so animator chains read data-last:
 * `circle.pipe(moveTo(...), fadeTo(...))`. That is the authored form in most
 * scenes, so the protocol is load-bearing, not a convenience.
 */
const InstanceProto = {
	_tag: "Instance" as const,
	pipe(this: unknown) {
		// biome-ignore lint: lint/style/noArguments: Pipeable's variadic protocol
		return Pipeable.pipeArguments(this, arguments);
	},
};

export const makeInstance = <Tag extends EntityTag>(
	id: string,
	kind: Tag,
): Instance<Tag> => Object.assign(Object.create(InstanceProto), { id, kind });

export const isInstance = (u: unknown): u is Instance =>
	typeof u === "object" &&
	u !== null &&
	"_tag" in u &&
	(u as { _tag: unknown })._tag === "Instance";

/** whether an instance refers to a given entity kind */
export const isInstanceOf = <Tag extends EntityTag>(
	tag: Tag,
	u: unknown,
): u is Instance<Tag> => isInstance(u) && u.kind === tag;

/**
 * An instance, or an un-yielded `instantiate` effect that produces one.
 * Animators accept both so a scene can chain straight off `instantiate`
 * without a separate `yield*`.
 */
export type InstanceOrEffect<
	Tag extends EntityTag = EntityTag,
	E = never,
	R = never,
> = Instance<Tag> | Effect.Effect<Instance<Tag>, E, R>;

/** resolve an {@link InstanceOrEffect} to the instance */
export const flattenInstance = <Tag extends EntityTag, E = never, R = never>(
	instance: InstanceOrEffect<Tag, E, R>,
): Effect.Effect<Instance<Tag>, E, R> =>
	isInstance(instance)
		? Effect.succeed(instance as Instance<Tag>)
		: (instance as Effect.Effect<Instance<Tag>, E, R>);

/** the data type an instance resolves to */
export type DataOf<I> =
	I extends Instance<infer Tag> ? EntityByTag<Tag> : never;
