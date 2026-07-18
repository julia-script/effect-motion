import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Color from "../Color";
import type * as Entity from "../Entity";

/**
 * The portable styling prop set shared by built-in shapes — deliberately
 * limited to what any plausible render target (SVG, canvas, Lottie) can
 * express. Camera pan/zoom is a sink-level view transform (see Camera.ts);
 * per-shape transforms (rotation) remain future territory.
 *
 * Visible defaults: a default-constructed shape must be visible on the
 * default (dark) background. Filled shapes default `fill` to white with
 * stroke absent; Line overrides this (stroke white, width 1 — see
 * Line.ts). Absent optional props are omitted by render targets, never
 * emitted with placeholder values.
 */

export const defaultedNumber = (value: number) =>
	Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(value)));

// z is depth (0 = the screen plane); a default-constructed shape sits at
// z=0 and projects to plain-2D coordinates under the resting camera.
export const position = {
	x: defaultedNumber(0),
	y: defaultedNumber(0),
	z: defaultedNumber(0),
};

// Euler orientation for a shape's plane. All-zero (the default) is a
// billboard facing the camera; non-zero tilts the plane in 3D.
export const orientation = {
	rotX: defaultedNumber(0),
	rotY: defaultedNumber(0),
	rotZ: defaultedNumber(0),
};

export const opacity = {
	opacity: defaultedNumber(1),
};

/** Common fields for fillable shapes. */
export const filled = {
	...position,
	fill: Color.Color.pipe(
		Schema.withConstructorDefault(Effect.succeed(Color.white)),
	),
	stroke: Schema.optionalKey(Color.Color),
	strokeWidth: Schema.optionalKey(Schema.Number),
	...opacity,
};

/** standard x/y/z position lens for shapes whose position IS x/y/z */
export const positionLens = <
	Data extends { x: number; y: number; z: number },
>(): //
Entity.TraitLens<Data, Entity.Position> => ({
	get: (data) => ({ x: data.x, y: data.y, z: data.z }),
	// spread of a generic yields Data & {...}; assignable back to Data
	set: (data, value) =>
		({ ...data, x: value.x, y: value.y, z: value.z }) as Data,
});

/** standard opacity lens */
export const opacityLens = <Data extends { opacity: number }>(): //
Entity.TraitLens<Data, number> => ({
	get: (data) => data.opacity,
	set: (data, opacity) => ({ ...data, opacity }) as Data,
});
