import * as Entity from "../Entity.js";
import * as Shape2D from "./Shape2D.js";

export const Ellipse = Entity.make(
	"shapes/Ellipse",
	{
		...Shape2D.filled,
		rx: Shape2D.defaultedNumber(20),
		ry: Shape2D.defaultedNumber(10),
	},
	{
		"~position": Shape2D.positionLens(),
		"~opacity": Shape2D.opacityLens(),
	},
);
