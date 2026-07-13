import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Entity from "../Entity";
import * as Shape2D from "./Shape2D";

// No fill — a line is unfillable, so unlike the filled shapes it defaults
// stroke black / strokeWidth 1: the visible default (see Shape2D.ts).
// x/y is the start point, x2/y2 the end point.
const fields = {
	...Shape2D.position,
	x2: Shape2D.defaultedNumber(0),
	y2: Shape2D.defaultedNumber(0),
	stroke: Schema.String.pipe(
		Schema.withConstructorDefault(Effect.succeed("black")),
	),
	strokeWidth: Shape2D.defaultedNumber(1),
	...Shape2D.opacity,
};

type LineData = Schema.Struct<typeof fields>["Type"];

export const Line = Entity.make("shapes/Line", fields, {
	// position moves the WHOLE line: translating x/y alone would stretch
	// it, so set shifts both endpoints by the delta (get = start point)
	"~position": {
		get: (data: LineData) => ({ x: data.x, y: data.y }),
		set: (data: LineData, value: Entity.Position): LineData => ({
			...data,
			x: value.x,
			y: value.y,
			x2: data.x2 + (value.x - data.x),
			y2: data.y2 + (value.y - data.y),
		}),
	},
	"~opacity": Shape2D.opacityLens(),
});
