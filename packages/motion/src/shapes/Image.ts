import * as Schema from "effect/Schema";
import * as Entity from "../Entity.js";
import * as Shape2D from "./Shape2D.js";

/**
 * A raster/vector image leaf. `image` names an asset declared via the
 * `Images` annotation; the render session decodes it once and every frame
 * reuses the decoded picture. An undeclared or failed asset paints nothing
 * (soft skip — the rest of the frame renders).
 *
 * `width`/`height` are optional and undefaulted: set BOTH to draw at that
 * size (numeric, so they tween); leave both absent to draw at the source's
 * natural size. A lone dimension is ignored (natural size used) — aspect
 * math would need the natural size, which frame data never sees.
 *
 * Billboard only: no orientation fields. ponytail: tilting an image needs a
 * projective setTransform (full 3×3, we hardcode the bottom row) mapping the
 * projected quad; add when a scene needs a tilted image.
 */
export const Image = Entity.make(
	"shapes/Image",
	{
		...Shape2D.position,
		image: Schema.String,
		width: Schema.optionalKey(Schema.Number),
		height: Schema.optionalKey(Schema.Number),
		...Shape2D.opacity,
	},
	{
		"~position": Shape2D.positionLens(),
		"~opacity": Shape2D.opacityLens(),
	},
);
