import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Entity from "../Entity";
import * as Shape2D from "./Shape2D";

/**
 * One vertex of a Path, local to the path's `x/y/z` anchor. `z` may be
 * omitted for plain-2D work — an absent depth renders as 0, so a 2D
 * author never types `z` and a 3D author sets it per point.
 */
export const PathPoint = Schema.Struct({
	x: Schema.Number,
	y: Schema.Number,
	z: Schema.optionalKey(Schema.Number),
});

export type PathPointType = typeof PathPoint.Type;

// `points` is required — an empty path can never be visible, so there is
// no sensible default. Path is skeletal (like Line): every vertex is an
// independent 3D point, projected with its own depth. Points are LOCAL to
// the x/y/z anchor — the anchor translates the whole path rigidly, which
// keeps position animatable (standard lens) without rewriting the array.
// `closed` joins the last point back to the first for stroking; fill
// always paints the implicitly-closed region (SVG semantics).
export const Path = Entity.make(
	"shapes/Path",
	{
		...Shape2D.filled,
		points: Schema.Array(PathPoint),
		closed: Schema.Boolean.pipe(
			Schema.withConstructorDefault(Effect.succeed(false)),
		),
	},
	{
		"~position": Shape2D.positionLens(),
		"~opacity": Shape2D.opacityLens(),
	},
);
