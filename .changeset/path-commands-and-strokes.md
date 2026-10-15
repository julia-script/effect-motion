---
"effect-motion": minor
"@effect-motion/renderer": minor
---

Expand Path commands to include horizontal/vertical lines, cubic and quadratic
Bézier curves, smooth continuations, elliptical arcs, and lowercase relative
forms, preserving local 3D coordinates and exact authored endpoints.

Add trimStart, trimEnd, trimOffset, strokeDasharray, and strokeDashoffset to
Path, Line, Rect, Circle, and Ellipse. Trim and dashes affect strokes while
preserving fills, planar stroke coverage, and per-point depth. Existing inputs
default to complete solid strokes with round caps and joins.
