---
"effect-motion": patch
---

Fix `Color.twMap.slate`, which was a verbatim copy of `fuchsia` — every
`Color.tw("slate", …)` shade returned a magenta instead of a blue-grey. The
eleven shades now carry Tailwind's own slate values.

Found while generating the palette for `@effect-motion/ide`'s colour
swatches. Scenes using `Color.tw("slate", …)` will change colour; that is
the fix, not a regression.
