---
"@effect-motion/renderer": minor
---

Honor entity transforms, render precomps through their own camera, and resolve equal-depth overlaps in tree order.

- Scale, rotation and Group opacity are drawn; a rotated shape is a real plane in 3D. Strokes scale with the shape.
- Content at the same depth paints in tree order, later over earlier, with no z-fighting at any camera distance (reversed-Z float depth plus a per-layer nudge). See-through layers (opacity < 1) write no depth, so a fading card no longer punches holes in what is drawn after it — except under depth of field, where they write depth for the DoF render so a fade on the focus plane stays sharp.
- `Scene.play` comps render through the child's own camera, draw their `Hud`, keep the inline orientation (they were upside-down), and share the root's font and image actors (images in comps no longer die as unregistered). Comps render sharp inside — the child camera's `aperture` is ignored — and blur as one layer by the parent's depth of field.
