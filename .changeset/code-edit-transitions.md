---
"@effect-motion/code": minor
---

Code blocks with Motion-Canvas-style edit transitions. `Code.block`
instantiates highlighted source as an ordinary Group of per-line Texts on a
monospace grid (em-ratio `charWidth`/`lineHeight`; derive exact values from
font bytes with `Metrics.gridFromFont`, a separate entry point that keeps
the font-parsing WASM out of manual-grid bundles). `Code.editTo` animates
to a complete new source string: a deterministic diff — line LCS, token
diff, and a migration pass — makes unchanged tokens slide (across lines
too), removals fade out, and insertions fade in, landing frame-exactly on
the new highlight. `Code.selectTo` runs the selection dim across the whole
block in source coordinates. Lines never wrap by design; tabs are a loud
defect.
