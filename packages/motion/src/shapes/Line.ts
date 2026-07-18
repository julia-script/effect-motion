import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Color from "../Color.js";
import * as Entity from "../Entity.js";
import * as Shape2D from "./Shape2D.js";

// No fill — a line is unfillable, so unlike the filled shapes it defaults
// stroke white / strokeWidth 1: the visible default (see Shape2D.ts).
// x/y/z is the start point, x2/y2/z2 the end point — a Line is skeletal:
// each endpoint is an independent 3D world point (no orientation fields).
const fields = {
	...Shape2D.position,
	x2: Shape2D.defaultedNumber(0),
	y2: Shape2D.defaultedNumber(0),
	z2: Shape2D.defaultedNumber(0),
	stroke: Color.Color.pipe(
		Schema.withConstructorDefault(Effect.succeed(Color.white)),
	),
	strokeWidth: Shape2D.defaultedNumber(1),
	...Shape2D.opacity,
};

type LineData = Schema.Struct<typeof fields>["Type"];

export const Line = Entity.make("shapes/Line", fields, {
	// position moves the WHOLE line: translating x/y/z alone would stretch
	// it, so set shifts both endpoints by the delta (get = start point)
	"~position": {
		get: (data: LineData) => ({ x: data.x, y: data.y, z: data.z }),
		set: (data: LineData, value: Entity.Position): LineData => ({
			...data,
			x: value.x,
			y: value.y,
			z: value.z,
			x2: data.x2 + (value.x - data.x),
			y2: data.y2 + (value.y - data.y),
			z2: data.z2 + (value.z - data.z),
		}),
	},
	"~opacity": Shape2D.opacityLens(),
});
