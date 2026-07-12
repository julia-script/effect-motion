import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

/**
 * The portable styling prop set shared by built-in shapes — deliberately
 * limited to what any plausible render target (SVG, canvas, Lottie) can
 * express. Transforms (rotation, scale) are future camera territory.
 *
 * Visible defaults: a default-constructed shape must be visible. Filled
 * shapes default `fill` to black with stroke absent; Line overrides this
 * (stroke black, width 1 — see Line.ts). Absent optional props are
 * omitted by render targets, never emitted with placeholder values.
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
		Schema.withConstructorDefault(Effect.succeed("black")),
	),
	stroke: Schema.optionalKey(Schema.String),
	strokeWidth: Schema.optionalKey(Schema.Number),
	...opacity,
};
