import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Entity from "../Entity";
import * as Shape2D from "./Shape2D";

// A container: positions and structures its children, paints nothing.
// `children` holds instance ids as plain data — scene updates on a group
// can reparent and reorder (paint order = array order). Child x/y are
// local to the group; targets compose the transforms.
export const Group = Entity.make(
	"shapes/Group",
	{
		...Shape2D.position,
		...Shape2D.opacity,
		children: Schema.Array(Schema.String).pipe(
			Schema.withConstructorDefault(Effect.sync(() => [])),
		),
	},
	{
		// moving a group moves the subtree (children keep local coordinates)
		"~position": Shape2D.positionLens(),
		"~opacity": Shape2D.opacityLens(),
	},
);
