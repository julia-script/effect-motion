import * as Schema from "effect/Schema";
import * as Entity from "../Entity";
import * as Shape2D from "./Shape2D";

// `d` is required — an empty path can never be visible, so there is no
// sensible default. x/y offset the whole path (targets translate it),
// keeping position animatable without rewriting `d`.
export const Path = Entity.make(
	"shapes/Path",
	{
		...Shape2D.filled,
		d: Schema.String,
	},
	{
		"~position": Shape2D.positionLens(),
		"~opacity": Shape2D.opacityLens(),
	},
);
