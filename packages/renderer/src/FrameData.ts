import type { Color } from "effect-motion";

/**
 * Typed readers over frame instance data.
 *
 * A frame's `instances[id].data` is `Entity.AnyEntity["data"]["Type"]` —
 * structurally `{}`, because an entity's fields are only known to the
 * entity that declared them. The renderer nonetheless has to read a few
 * well-known shapes out of it (position, size, children, resource ids),
 * and each read needs a cast that TypeScript cannot check.
 *
 * This module is where those casts live — written once each, named, and
 * documented — instead of scattered through the walk. The readers are
 * deliberately defensive: every field is optional and every return is
 * either a checked value or a documented fallback, so malformed data
 * degrades predictably rather than throwing from inside a hot loop.
 */

/** A 2D affine, as a Group's `transform` field carries it. */
export interface Affine {
	readonly a: number;
	readonly b: number;
	readonly c: number;
	readonly d: number;
	readonly e: number;
	readonly f: number;
}

/** Local position; missing axes read as 0 (the scene-graph default). */
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

interface Probe {
	readonly x?: unknown;
	readonly y?: unknown;
	readonly z?: unknown;
	readonly width?: unknown;
	readonly height?: unknown;
	readonly children?: unknown;
	readonly opacity?: unknown;
	readonly transform?: unknown;
	readonly backgroundColor?: unknown;
	readonly fontFamily?: unknown;
	readonly image?: unknown;
	readonly "~visible"?: unknown;
}

/** The one cast: entity data is `{}`, so reading it means probing it. */
const probe = (data: unknown): Probe => (data ?? {}) as Probe;

const numberOr = (value: unknown, fallback: number): number =>
	typeof value === "number" ? value : fallback;

/** Local position, defaulting each missing axis to 0. */
export const positionOf = (data: unknown): Position => {
	const p = probe(data);
	return {
		x: numberOr(p.x, 0),
		y: numberOr(p.y, 0),
		z: numberOr(p.z, 0),
	};
};

/**
 * Composition size, or `null` when this entity is not sized. Both
 * dimensions must be numbers: a sized group is what makes a subtree a
 * comp, and a half-specified size is not one.
 */
export const sizeOf = (data: unknown): Size | null => {
	const p = probe(data);
	return typeof p.width === "number" && typeof p.height === "number"
		? { width: p.width, height: p.height }
		: null;
};

/** Child instance ids; anything non-array reads as no children. */
export const childIdsOf = (data: unknown): ReadonlyArray<string> => {
	const children = probe(data).children;
	return Array.isArray(children) ? (children as ReadonlyArray<string>) : [];
};

/** Whether the entity is visible — absent `~visible` means visible. */
export const isVisible = (data: unknown): boolean =>
	probe(data)["~visible"] !== false;

/** Group opacity, clamped to 0..1; absent reads as fully opaque. */
export const opacityOf = (data: unknown): number => {
	const opacity = numberOr(probe(data).opacity, 1);
	return Math.max(0, Math.min(1, opacity));
};

/** A group's 2D affine, or `null` when absent or the identity. */
export const affineOf = (data: unknown): Affine | null => {
	const transform = probe(data).transform;
	if (transform === null || typeof transform !== "object") {
		return null;
	}
	const m = transform as Partial<Affine>;
	const affine: Affine = {
		a: numberOr(m.a, 1),
		b: numberOr(m.b, 0),
		c: numberOr(m.c, 0),
		d: numberOr(m.d, 1),
		e: numberOr(m.e, 0),
		f: numberOr(m.f, 0),
	};
	const isIdentity =
		affine.a === 1 &&
		affine.b === 0 &&
		affine.c === 0 &&
		affine.d === 1 &&
		affine.e === 0 &&
		affine.f === 0;
	return isIdentity ? null : affine;
};

/** A comp's own background color, or `null` for a transparent comp. */
export const backgroundColorOf = (data: unknown): Color.Color | null => {
	const background = probe(data).backgroundColor;
	return background === undefined || background === null
		? null
		: (background as Color.Color);
};

/** The font-family resource id on a Text entity, if it carries one. */
export const fontFamilyIdOf = (data: unknown): string | null => {
	const family = probe(data).fontFamily;
	if (family === null || typeof family !== "object") {
		return null;
	}
	const id = (family as { id?: unknown }).id;
	return typeof id === "string" ? id : null;
};

/** The image resource id on an Image entity, if it carries one. */
export const imageIdOf = (data: unknown): string | null => {
	const image = probe(data).image;
	if (image === null || typeof image !== "object") {
		return null;
	}
	const id = (image as { id?: unknown }).id;
	return typeof id === "string" ? id : null;
};
