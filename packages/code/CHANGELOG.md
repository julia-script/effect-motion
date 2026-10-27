# @effect-motion/code

## 1.0.0

### Minor Changes

- ac08e95: Code blocks with Motion-Canvas-style edit transitions. `Code.block`
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
- ac08e95: Per-range colored text and syntax highlighting. `Text` gains an optional
  `spans` field — non-overlapping `{ from, to, fillColor }` ranges that color
  characters of the string individually while everything else about the entity
  (font, size, anchoring, opacity, depth behavior) stays whole-Text. The
  renderer draws spans as per-range styles in a single glyph mesh; changing
  only span colors between frames never re-shapes the string. Span boundaries
  bound ligature formation (a `=>` arrow ligature never forms across a span
  edge).

  New package `@effect-motion/code`: author-side syntax highlighting.
  `Highlight.highlight(code, parser, theme)` tokenizes with a caller-supplied
  Lezer parser (language grammars are your own dependency) through a
  plain-object theme and returns `{ text, spans }` spreadable into a Text.
  `Selection.dim` derives a selection — kept ranges stay at full color, the
  rest mixes toward the backdrop — and `Selection.select`/`selectTo` animate
  between selections frame-exactly.

### Patch Changes

- Updated dependencies [47b4de0]
- Updated dependencies [1e8b5bf]
- Updated dependencies [f895634]
- Updated dependencies [ac08e95]
  - effect-motion@1.0.0
