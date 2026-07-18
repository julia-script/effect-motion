import * as Entity from "../Entity.js";
import * as Shape2D from "./Shape2D.js";

export const Circle = Entity.make(
	"shapes/Circle",
	{
		...Shape2D.filled,
		radius: Shape2D.defaultedNumber(10),
	},
	{
		"~position": Shape2D.positionLens(),
		"~opacity": Shape2D.opacityLens(),
	},
);
