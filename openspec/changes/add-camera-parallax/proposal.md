# Add an animatable camera with per-layer parallax

## Why

Scenes today render at a fixed viewport: instance world coordinates map
straight to screen coordinates. There is no way to pan, zoom, or follow the
action — every scene is shot from a locked-off tripod. `Shape2D.ts` already
flags this gap ("Transforms (rotation, scale) are future camera territory").

We want a **camera** that can be panned and zoomed over time using the same
animation primitives as everything else, and a **z-axis / parallax** effect so
that layers at different depths move by different amounts as the camera moves —
the standard cue that sells depth in 2D motion graphics.

## What Changes

- **Camera as an Instance.** A camera is an ordinary instance carrying a
  `~position` trait (`x`, `y`) plus a `zoom` field. It is animated by the
  existing animators with zero new animation code: `camera.pipe(moveTo(...))`,
  `spring("zoom", 2)`, `Scene.fork` a camera move concurrent with the action.
  The camera is never drawn; it is view state, not a shape.
- **Camera rides on the Frame.** The runner exposes the current camera as
  frame/view metadata (`FrameMeta.camera`), the same self-describing channel
  that already carries `width/height/backgroundColor`. Instance data stays in
  **world coordinates** — the camera never mutates entity data, which keeps
  determinism and `moveTo` semantics honest.
- **Per-Group `depth` for parallax.** `Group` gains an optional `depth` field
  (default `1`). Each top-level layer's on-screen transform is the camera's
  effect scaled by that layer's depth. `depth: 0` pins a layer to the screen
  (a HUD that ignores the camera); `depth` between 0 and 1 produces parallax.
- **Transform applied in the SVG sinks.** Both SVG sinks wrap each top-level
  layer in a `<g>` whose transform is computed from `camera × depth`. Zoom
  scales everything inside (stroke, text included) — acceptable for v1.

## Non-goals (v1)

- Per-instance continuous z (parallax is per-Group only; a per-shape z can come
  later without breaking this).
- Rotation, or any camera transform beyond pan + uniform zoom.
- A "HUD-crisp" mode where zoom scales positions but not stroke/text widths —
  v1 scales everything; `depth: 0` HUDs escape zoom entirely via the depth rule.
- Camera easing/inertia helpers beyond what the existing animators give.
