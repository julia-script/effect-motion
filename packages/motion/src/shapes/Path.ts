import * as Schema from "effect/Schema";
import * as Entity from "../Entity.js";
import * as Shape2D from "./Shape2D.js";

// A command point, LOCAL to the path's anchor (x/y/z). `z` is optionalKey
// (absent = 0, coalesced at render): nested constructor defaults would not
// fire through the entity struct's `make`, so absence is the default.
const point = {
	x: Schema.Number,
	y: Schema.Number,
	z: Schema.optionalKey(Schema.Number),
};

// The command vocabulary: M (move to) starts a subpath, L (line to) extends
// it, Z closes it. Straight polylines only — curves/arcs arrive in a later
// iteration via deterministic flattening.
export const PathCommand = Schema.TaggedUnion({
	M: point,
	L: point,
	Z: {},
});

export type PathCommand = typeof PathCommand.Type;

// `commands` is required — an empty path can never be visible, so there is
// no sensible default. Points are local to the anchor: the ~position trait
// moves the anchor and never rewrites the array. The first command must be
// M (every subpath needs a start point) — a loud failure at instantiation.
export const Path = Entity.make(
	"shapes/Path",
	{
		...Shape2D.filled,
		commands: Schema.NonEmptyArray(PathCommand).check(
			Schema.makeFilter((commands) =>
				commands[0]._tag === "M"
					? undefined
					: { path: [0], issue: "the first path command must be M" },
			),
		),
	},
	{
		"~position": Shape2D.positionLens(),
		"~opacity": Shape2D.opacityLens(),
	},
);
