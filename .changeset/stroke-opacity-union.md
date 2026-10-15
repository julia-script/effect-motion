---
"@effect-motion/renderer": patch
"@effect-motion/three": patch
---

Planar strokes now composite opacity once across joins, closure, self-crossings,
retracing and all subpaths of one Path. Separate entities still blend separately.
A retained multisample occupancy mask preserves transparent holes and reuses
coverage through color and opacity fades. Nonplanar 3D strokes retain per-point depth.
