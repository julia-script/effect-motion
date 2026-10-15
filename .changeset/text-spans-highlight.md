---
"effect-motion": minor
"@effect-motion/renderer": minor
"@effect-motion/code": minor
---

Per-range colored text and syntax highlighting. `Text` gains an optional
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
