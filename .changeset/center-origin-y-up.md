---
"effect-motion": minor
"@effect-motion/renderer": minor
---

Scene space is now center-origin and y-up, and shapes anchor at their center.

**BREAKING (pre-1.0 minor):** the authoring frame changes from y-down/top-left (the SVG convention) to **x right, y up, origin at the viewport center, +z toward the viewer** — a right-handed frame, like Manim and Motion Canvas. Every coordinate in every scene changes meaning:

- `(0, 0)` is the middle of the frame; the visible extent at z=0 is x ∈ [−width/2, width/2], y ∈ [−height/2, height/2]. Migrate positions with `x' = x − width/2`, `y' = height/2 − y`.
- Positive `rotation.z` now reads **counterclockwise** on screen; migrate visual rotations with `rotX' = −rotX`, `rotZ' = −rotZ` (`rotY` unchanged).
- **Rect, Square, and Image are center-anchored**: `position` is the shape's center and rotation is about it (Circle/Ellipse already were; Text keeps its typographic `textAnchor`/`baseline` semantics; Line/Path are point-defined).
- The camera's `x`/`y` are plain world coordinates (the resting camera sits at `(0, 0)`), and `Projection.project`/`toView`/`resolveCamera` lost their `origin` parameter — with a center origin it was always zero.
- `Scene.play` mounts center in the enclosing comp at `(0, 0)` by construction; the composite plane is center-anchored like an Image.
- Particles: positive `gravity` still pulls toward the bottom of the screen; launch `angle: 0` still means straight up, but positive angles are now counterclockwise; a fill field's region is centered on the field's position. The RNG draw sequence is unchanged, so seeded streams are stable.

The renderer's scene→three mapping is now the identity (three is y-up/center-origin natively); y-flips survive only at genuinely y-down boundaries (font metrics, texture row order, pixel readback).
