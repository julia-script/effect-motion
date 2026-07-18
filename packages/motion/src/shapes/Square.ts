import * as Entity from "../Entity.js";
import * as Shape2D from "./Shape2D.js";

// its own entity, not Rect sugar: the schema IS the width === height
// constraint, which a Rect can't enforce through updates
export const Square = Entity.make(
	"shapes/Square",
	{
		...Shape2D.filled,
		size: Shape2D.defaultedNumber(100),
	},
	{
		"~position": Shape2D.positionLens(),
		"~opacity": Shape2D.opacityLens(),
	},
);
