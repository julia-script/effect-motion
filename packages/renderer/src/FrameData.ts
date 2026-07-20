import type { Color, Shapes } from "effect-motion";
import type * as Entity from "effect-motion/Entity";

/**
 * Typed readers over frame instance data.
 *
 * A frame's `instances[id].data` is `Entity.AnyEntity["data"]["Type"]` —
 * structurally `{}`, because an entity's fields are only known to the
 * entity that declared them. The renderer nonetheless has to read a few
 * well-known shapes out of it.
 *
 * The shapes themselves are NOT re-declared here: every type below is
 * derived from the motion package's own entity schemas, so a field that
 * is renamed or retyped upstream breaks this module at compile time
 * rather than silently reading `undefined` at runtime. What remains
 * unavoidable is the *narrowing* — going from `{}` to a known entity's
 * data — and that single cast lives in `dataOf`, once, rather than
 * scattered through the walk.
 */

/** Every entity's data carries the Shape2D base (position, opacity). */
type Shape2DData = Entity.EntityData<
	(typeof Shapes.Circle)["data"]["fields"]
>["Type"];

/** A Group's data: the base plus children, size, transform, background. */
type GroupData = Entity.EntityData<
	(typeof Shapes.Group)["data"]["fields"]
>["Type"];

type TextData = Entity.EntityData<
	(typeof Shapes.Text)["data"]["fields"]
>["Type"];

type ImageData = Entity.EntityData<
	(typeof Shapes.Image)["data"]["fields"]
>["Type"];

/** The 2D affine a Group carries, straight from motion's schema. */
export type Affine = Shapes.TransformMatrix;

/** Composed local position — the Shape2D base every entity shares. */
export interface Position {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

/** Composition size — present only on sized groups (comps). */
export interface Size {
	readonly width: number;
	readonly height: number;
}

/**
 * The one narrowing cast: frame data is `{}`, so reading a known field
 * means asserting the entity's own shape. Every reader below goes through
 * here, and each still guards the field it reads — an entity that does
 * not carry it (a Circle has no `children`) simply misses.
 */
const dataOf = (data: unknown): Partial<GroupData & TextData & ImageData> =>
	(data ?? {}) as Partial<GroupData & TextData & ImageData>;

/** Local position, defaulting each missing axis to 0. */
export const positionOf = (data: unknown): Position => {
	const d = dataOf(data) as Partial<Shape2DData>;
	return {
		x: d.x ?? 0,
		y: d.y ?? 0,
		z: d.z ?? 0,
	};
};

/**
 * Composition size, or `null` when this entity is not sized. Both
 * dimensions must be present: a sized group is what makes a subtree a
 * comp, and a half-specified size is not one.
 */
export const sizeOf = (data: unknown): Size | null => {
	const { width, height } = dataOf(data);
	return typeof width === "number" && typeof height === "number"
		? { width, height }
		: null;
};

/** Child instance ids; an entity without children reads as none. */
export const childIdsOf = (data: unknown): ReadonlyArray<string> =>
	dataOf(data).children ?? [];

/** Whether the entity is visible — absent `~visible` means visible. */
export const isVisible = (data: unknown): boolean =>
	dataOf(data)["~visible"] !== false;

/** Group opacity, clamped to 0..1; absent reads as fully opaque. */
export const opacityOf = (data: unknown): number =>
	Math.max(0, Math.min(1, dataOf(data).opacity ?? 1));

/** A group's 2D affine, or `null` when absent or the identity. */
export const affineOf = (data: unknown): Affine | null => {
	const transform = dataOf(data).transform;
	if (transform === undefined) {
		return null;
	}
	const isIdentity =
		transform.a === 1 &&
		transform.b === 0 &&
		transform.c === 0 &&
		transform.d === 1 &&
		transform.e === 0 &&
		transform.f === 0;
	return isIdentity ? null : transform;
};

/** A comp's own background color, or `null` for a transparent comp. */
export const backgroundColorOf = (data: unknown): Color.Color | null =>
	dataOf(data).backgroundColor ?? null;

/** The font-family resource id on a Text entity, if it carries one. */
export const fontFamilyIdOf = (data: unknown): string | null =>
	dataOf(data).fontFamily?.id ?? null;

/** The image resource id on an Image entity, if it carries one. */
export const imageIdOf = (data: unknown): string | null =>
	dataOf(data).image?.id ?? null;
