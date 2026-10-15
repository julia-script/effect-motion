---
"effect-motion": minor
"@effect-motion/renderer": minor
---

Add finite, animatable `Rect.cornerRadius` with a sharp default of zero.
Rounded fills and outlines share a centered contour and support stroke trim
and dashes. Rendering clamps radius to half the smaller absolute dimension
without changing authored animation values or signed dimension semantics.
Retain geometry on color/opacity updates and release replaced resources.
