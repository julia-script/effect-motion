import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as Entity from "../Entity";

/**
 * The portable styling prop set shared by built-in shapes — deliberately
 * limited to what any plausible render target (SVG, canvas, Lottie) can
 * express. Transforms (rotation, scale) are future camera territory.
 *
 * Visible defaults: a default-constructed shape must be visible on the
 * default (dark) background. Filled shapes default `fill` to white with
 * stroke absent; Line overrides this (stroke white, width 1 — see
 * Line.ts). Absent optional props are omitted by render targets, never
 * emitted with placeholder values.
 */

export const defaultedNumber = (value: number) =>
	Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(value)));

export const position = {
	x: defaultedNumber(0),
	y: defaultedNumber(0),
};

export const opacity = {
	opacity: defaultedNumber(1),
};

/** Common fields for fillable shapes. */
export const filled = {
	...position,
	fill: Schema.String.pipe(
		Schema.withConstructorDefault(Effect.succeed("white")),
	),
	stroke: Schema.optionalKey(Schema.String),
	strokeWidth: Schema.optionalKey(Schema.Number),
	...opacity,
};

/** standard x/y position lens for shapes whose position IS x/y */
export const positionLens = <Data extends { x: number; y: number }>(): //
Entity.TraitLens<Data, Entity.Position> => ({
	get: (data) => ({ x: data.x, y: data.y }),
	// spread of a generic yields Data & {...}; assignable back to Data
	set: (data, value) => ({ ...data, x: value.x, y: value.y }) as Data,
});

/** standard opacity lens */
export const opacityLens = <Data extends { opacity: number }>(): //
Entity.TraitLens<Data, number> => ({
	get: (data) => data.opacity,
	set: (data, opacity) => ({ ...data, opacity }) as Data,
});
