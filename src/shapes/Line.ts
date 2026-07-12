import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Entity from "../Entity";
import * as Shape2D from "./Shape2D";

// No fill — a line is unfillable, so unlike the filled shapes it defaults
// stroke black / strokeWidth 1: the visible default (see Shape2D.ts).
// x/y is the start point, x2/y2 the end point.
export const Line = Entity.make("shapes/Line", {
	...Shape2D.position,
	x2: Shape2D.defaultedNumber(0),
	y2: Shape2D.defaultedNumber(0),
	stroke: Schema.String.pipe(
		Schema.withConstructorDefault(Effect.succeed("black")),
	),
	strokeWidth: Shape2D.defaultedNumber(1),
	...Shape2D.opacity,
});
