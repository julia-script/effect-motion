import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Entity from "../Entity";
import * as Shape2D from "./Shape2D";

// A parallax layer: a container that holds children at a camera `depth`, and
// nothing else. Unlike Group it carries NO position or opacity of its own —
// `depth` is the only field, so it can never collide with the transform
// semantics a Group is expected to grow (position now, rotation/scale later),
// and a future guard can restrict Layers without touching Group.
//
// `depth` is the fraction of the camera this layer feels (pan AND zoom): 1 =
// full camera (default), 0 = pinned to the screen (a HUD), between = parallax.
// The sink reads it off each top-level layer (see svg/camera.ts).
//
// ponytail: a Layer nested inside another Layer is undefined behavior — the
// point of a dedicated entity is to leave room for a rule here, but the
// semantics ("a depth inside a depth"?) aren't decided yet, so no guard ships.
// Add one in Runner.instantiate (dispatch on entity.name === Layer.name) once
// nesting semantics are settled.
export const Layer = Entity.make("shapes/Layer", {
	depth: Shape2D.defaultedNumber(1),
	children: Schema.Array(Schema.String).pipe(
		Schema.withConstructorDefault(Effect.sync(() => [])),
	),
});
