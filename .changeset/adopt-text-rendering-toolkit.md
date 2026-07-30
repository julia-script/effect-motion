---
"@effect-motion/renderer": minor
---

Replace the hand-rolled text pipeline (troika typesetting + webgl-sdf-generator
+ a fixed 256-glyph atlas and hand-built two-pass material) with
`@text-rendering-toolkit`: real HarfBuzz shaping, a growable glyph atlas, and
the toolkit's depth-ink glyph mesh. Rendering semantics are preserved — SDF
crispness, anchor/baseline behavior, exactly-once ink blending at partial
opacity, z-buffer occlusion, and the loud missing-font defect. The fixed atlas
capacity (and its overflow error) is gone. Note: the font engine ships ~390 KB
of HarfBuzz WASM resolved via `import.meta.url`; bundlers must handle a `.wasm`
asset reference (Node and Vite/Next work out of the box).
