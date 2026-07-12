import * as Entity from "../Entity";
import * as Shape2D from "./Shape2D";

export const Rect = Entity.make("shapes/Rect", {
	...Shape2D.filled,
	width: Shape2D.defaultedNumber(100),
	height: Shape2D.defaultedNumber(100),
});
