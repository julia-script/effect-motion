---
"@effect-motion/renderer": patch
"@effect-motion/three": patch
"@effect-motion/react": patch
---

Preserve thin-stroke coverage with retained supersampled occupancy masks and
mip-filtered reduction. Paint surfaces now use the same four-sample policy as the
final scene. Target density follows viewport scale, local depth and projected
magnification while authored fractional widths and positions stay unchanged.

The Player now requests native device pixel ratio. CSS may still scale its finished
canvas; the border lab includes native-size width/offset/orientation controls.
