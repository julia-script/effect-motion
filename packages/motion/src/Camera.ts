import type * as Schema from "effect/Schema";
import * as Entity from "./Entity";
import * as Projection from "./Projection";
import * as Shape2D from "./shapes/Shape2D";

/**
 * The camera is view state, not a shape — it is never registered with a sink
 * and never drawn. It exists as an ordinary Instance so the existing
 * animators drive it for free: `camera.pipe(moveTo({ z: -800 }))`,
 * `tween("rotY", ...)`, `spring`, `Scene.fork`, etc.
 *
 * `~position` (now x/y/z) is the camera's world position; `rotX/rotY/rotZ`
 * are its Euler orientation; `focalLength` sets the field of view. At rest
 * the camera sits a focal-length back on +z looking down world -z, so a
 * world point at z=0 projects to plain-2D screen coordinates — see
 * `Projection.ts`. The sink reads these off `FrameMeta.camera` and projects
 * every instance through them; instance data stays in world coordinates, so
 * determinism and `moveTo` semantics are untouched by the camera.
 */
const fields = {
	x: Shape2D.defaultedNumber(0),
	y: Shape2D.defaultedNumber(0),
	z: Shape2D.defaultedNumber(
		Projection.defaultCameraZ(Projection.DEFAULT_FOCAL_LENGTH),
	),
	rotX: Shape2D.defaultedNumber(0),
	rotY: Shape2D.defaultedNumber(0),
	rotZ: Shape2D.defaultedNumber(0),
	focalLength: Shape2D.defaultedNumber(Projection.DEFAULT_FOCAL_LENGTH),
};

type CameraData = Schema.Struct<typeof fields>["Type"];

export const Camera = Entity.make("Camera", fields, {
	// x/y/z is the camera position; rotation + focalLength are raw numeric
	// fields animated via tween. Inlined (not positionLens()) so the data
	// type flows into the lens.
	"~position": {
		get: (data: CameraData) => ({ x: data.x, y: data.y, z: data.z }),
		set: (data: CameraData, value: Entity.Position): CameraData => ({
			...data,
			x: value.x,
			y: value.y,
			z: value.z,
		}),
	},
});

/** The identity view: resting camera, no rotation, default focal length. */
export const IDENTITY: CameraState = {
	x: 0,
	y: 0,
	z: Projection.defaultCameraZ(Projection.DEFAULT_FOCAL_LENGTH),
	rotX: 0,
	rotY: 0,
	rotZ: 0,
	focalLength: Projection.DEFAULT_FOCAL_LENGTH,
};

/** The camera view carried on each frame. */
export type CameraState = Projection.CameraView;
