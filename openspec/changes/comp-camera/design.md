## Context

The Runner held one active camera; `Scene.camera` returned it wherever it was called. Comps were rendered by `syncComp` with `Runner.identityCameraView(width)`. A child scene's camera moves therefore steered the root view and never reached its own comp.

## Decisions

**D1 — Cameras scoped by comp, keyed by mount-group id.** A `Context.Reference<string | null>` (`Runner.CurrentComp`, default `null` = root) is provided by `Scene.play` alongside `CurrentParent`. The Runner keeps `activeCameras: Map<compId | null, cameraId>` and one default camera per comp, created in `registerComp` from `identityCamera(child.width)` — the same resting view the renderer used before, so an untouched child is unchanged. Alternative: a camera field on the mount group — rejected, a comp is declared through `registerComp`, not through group fields (design D13 of scene mounting).

**D2 — The frame carries the view, not an id.** `Frame.comps[id]` gains `camera` (the resolved `CameraView & PointOfInterest`), mirroring `Frame.camera` for the root. The renderer needs no instance lookup and the frame stays self-describing.

**D3 — Renderer change is one line.** `syncComp` already builds a full inner sync; its camera now comes from the frame. The render target, clipping, nested recursion, and outer placement are untouched.

**D4 — Comp HUD pass.** The comp's `hudScene` was synced but never rendered. `renderCompTargets` now renders it after the world into the same target (autoClear off, depth cleared), mirroring the browser root path. The render target has no output transform, so no double sRGB concern.

**D5 — Depth of field: the parent's only.** Main's depth-aware DoF runs as a post chain whose passes size themselves to the drawing buffer and end in the sRGB output transform, so it cannot draw into a comp target as is. A comp therefore renders sharp — the child camera's `aperture` / `focusDistance` are ignored — and its composited plane takes the parent's DoF at the plane's depth, like any layer. Alternative: a per-comp DoF chain sized to the comp target with the output transform off — deferred (ponytail in `renderCompTargets`) until a precomp needs its own focus.

## Risks

- Behavior change for a child that moved the root camera by accident of the old sharing — now it moves its own. Intended: nested must equal standalone.
- `Scene.comp()` still returns the ROOT comp config inside a child (documented as "the movie's"); unchanged here.
