---
"effect-motion": major
"@effect-motion/renderer": major
"@effect-motion/three": patch
---

Scenes now default to paint compositing: later children paint over earlier children,
including coplanar fills, borders and text. Set `compositing: "depth"` in Scene.make
metadata to preserve physical 3D occlusion. Frames and Scene.play mounts carry the
mode explicitly.

Groups can opt into `compositing: "paint"` to form a flat surface inside a depth
scene. Bounds follow the contents, transforms and opacity apply once to the surface,
and transparent holes do not occlude the background. Ordinary groups inherit their
context. Retained ordering updates when siblings reorder, and removed composition
resources are now disposed correctly.
