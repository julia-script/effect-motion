import * as Entity from "../Entity";
import * as Shape2D from "./Shape2D";

export const Ellipse = Entity.make("shapes/Ellipse", {
	...Shape2D.filled,
	rx: Shape2D.defaultedNumber(20),
	ry: Shape2D.defaultedNumber(10),
});
