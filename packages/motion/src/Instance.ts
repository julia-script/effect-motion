import * as Effect from "effect/Effect";
import * as Pipeable from "effect/Pipeable";
import type { EntityByTag, EntityTag } from "./Entity.js";

/**
 * An Instance is a REFERENCE to a live entity in the runner tree: an id and
 * the tag of what it is. It carries no entity data — the runner owns that —
 * so it stays a tiny, pipeable handle that animator chains flow through.
 */

/**
 * A handle to something living in a scene — what `Scene.instantiate` returns
 * and what every animator takes.
 *
 * @remarks
 * An instance holds no entity data of its own, only an id and a kind. The
 * data lives in the scene and changes every frame; the handle stays valid
 * throughout, which is why it can be captured once and animated repeatedly.
 * To read the current values, use `Scene.data`.
 *
 * The `Tag` parameter is what makes animators statically safe: `fadeTo`
 * accepts only instances whose entity actually has an `opacity`, so fading a
 * Camera fails at compile time with a message naming the missing field
 * rather than misbehaving at runtime.
 *
 * Instances are pipeable, and are themselves Effects resolving to
 * themselves — the two properties that let `circle.pipe(moveTo(…),
 * fadeTo(…))` read as one chain.
 *
 * @typeParam Tag - Which entity this refers to, e.g. `"Circle"`.
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

/**
 * Build an instance handle from an id and a kind.
 *
 * @remarks
 * Internal plumbing — the scene runner calls this when creating entities.
 * Author code gets handles from `Scene.instantiate` instead; constructing
 * one by hand refers to an entity that may not exist.
 */
export const makeInstance = <Tag extends EntityTag>(
	id: string,
	kind: Tag,
): Instance<Tag> => Object.assign(Object.create(InstanceProto), { id, kind });

/**
 * Whether `u` is an {@link Instance}.
 *
 * @remarks
 * The dispatch behind every dual animator: `moveTo(circle, …)` and
 * `circle.pipe(moveTo(…))` are told apart by testing the first argument
 * with this, rather than by counting arguments — trailing optional
 * parameters make arity ambiguous.
 */
export const isInstance = (u: unknown): u is Instance =>
	typeof u === "object" &&
	u !== null &&
	"_tag" in u &&
	(u as { _tag: unknown })._tag === "Instance";

/**
 * Whether `u` is an instance of one specific entity kind.
 *
 * @remarks
 * Narrows to `Instance<Tag>`, so a heterogeneous list can be filtered down
 * to the circles and then animated with circle-only fields.
 *
 * @param tag - The kind to test for, e.g. `"Circle"`.
 * @param u - The value to test.
 */
export const isInstanceOf = <Tag extends EntityTag>(
	tag: Tag,
	u: unknown,
): u is Instance<Tag> => isInstance(u) && u.kind === tag;

/**
 * An instance, or an un-yielded `instantiate` effect that produces one.
 *
 * @remarks
 * Animators accept both, so a scene can animate straight off an
 * `instantiate` call without binding it to a variable first — the create
 * step and the first animation read as one expression.
 */
export type InstanceOrEffect<
	Tag extends EntityTag = EntityTag,
	E = never,
	R = never,
> = Instance<Tag> | Effect.Effect<Instance<Tag>, E, R>;

/** Resolve an {@link InstanceOrEffect} to the instance itself. */
export const flattenInstance = <Tag extends EntityTag, E = never, R = never>(
	instance: InstanceOrEffect<Tag, E, R>,
): Effect.Effect<Instance<Tag>, E, R> =>
	isInstance(instance)
		? Effect.succeed(instance as Instance<Tag>)
		: (instance as Effect.Effect<Instance<Tag>, E, R>);

/** The entity data type a given instance handle refers to. */
export type DataOf<I> =
	I extends Instance<infer Tag> ? EntityByTag<Tag> : never;
