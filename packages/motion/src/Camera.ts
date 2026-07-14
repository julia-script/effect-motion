import type * as Schema from "effect/Schema";
import * as Entity from "./Entity";
import * as Shape2D from "./shapes/Shape2D";

/**
 * The camera is view state, not a shape — it is never registered with a
 * sink and never drawn. It exists as an ordinary Instance so the existing
 * animators drive it for free: `camera.pipe(moveTo({ x: 400 }))`,
 * `tween("zoom", ...)`, `spring`, `Scene.fork`, etc.
 *
 * `~position` (x/y) is the pan in world units; `zoom` is a uniform scale
 * (1 = identity). The sink reads these off `FrameMeta.camera` and applies
 * them per top-level layer, scaled by each layer's `depth` — instance data
 * stays in world coordinates, so determinism and `moveTo` semantics are
 * untouched by the camera.
 */
const fields = {
	...Shape2D.position,
	zoom: Shape2D.defaultedNumber(1),
};

type CameraData = Schema.Struct<typeof fields>["Type"];

export const Camera = Entity.make("Camera", fields, {
	// only ~position: zoom is a raw numeric field, animated via tween.
	// Inlined (not positionLens()) so the data type flows into the lens —
	// the generic helper needs a second trait present to infer it.
	"~position": {
		get: (data: CameraData) => ({ x: data.x, y: data.y }),
		set: (data: CameraData, value: Entity.Position): CameraData => ({
			...data,
			x: value.x,
			y: value.y,
		}),
	},
});

/** The identity view: no pan, no zoom. */
export const IDENTITY = { x: 0, y: 0, zoom: 1 } as const;

export interface CameraState {
	readonly x: number;
	readonly y: number;
	readonly zoom: number;
}
