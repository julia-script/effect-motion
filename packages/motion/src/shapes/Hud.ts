import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Entity from "../Entity.js";
import * as Shape2D from "./Shape2D.js";

/**
 * A screen-space container: its subtree is projected through the IDENTITY
 * camera instead of the active one, so HUD content ignores camera movement,
 * zoom, shake — and depth of field (the identity camera's aperture is 0).
 * HUD content always paints on top of world content.
 *
 * `x`/`y` compose into the children in screen coordinates (slide a whole
 * lower-third in with one tween). There is deliberately no `z`: the
 * container has no world depth. Children may still use their own `z` for
 * deliberate in-HUD depth; it defaults to 0 (flat, plain-2D placement).
 *
 * A Hud must be a top-level child of the root — nesting it inside world
 * content would compose world offsets into screen coordinates and is a loud
 * defect. A Hud inside a Hud behaves as a plain group.
 */
const fields = {
	x: Shape2D.defaultedNumber(0),
	y: Shape2D.defaultedNumber(0),
	children: Schema.Array(Schema.String).pipe(
		Schema.withConstructorDefault(Effect.sync(() => [])),
	),
};

type HudData = Entity.EntityData<typeof fields>["Type"];

export const Hud = Entity.make("shapes/Hud", fields, {
	// screen-space position; z is pinned 0 (no world depth on the container)
	"~position": {
		get: (data: HudData) => ({ x: data.x, y: data.y, z: 0 }),
		set: (data: HudData, value: Entity.Position): HudData => ({
			...data,
			x: value.x,
			y: value.y,
		}),
	},
});
