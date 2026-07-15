import * as Entity from "../Entity";
import * as Shape2D from "./Shape2D";

// A Rect is the canonical 2.5D plane: give it Euler orientation so it can
// tilt in 3D (lie flat as a floor, tilt as a wall). All-zero rotation (the
// default) keeps it a camera-facing billboard. The renderer projects its
// four corners when tilted (see Renderer flatten + Projection.planeCorners).
export const Rect = Entity.make(
	"shapes/Rect",
	{
		...Shape2D.filled,
		...Shape2D.orientation,
		width: Shape2D.defaultedNumber(100),
		height: Shape2D.defaultedNumber(100),
	},
	{
		"~position": Shape2D.positionLens(),
		"~opacity": Shape2D.opacityLens(),
	},
);
