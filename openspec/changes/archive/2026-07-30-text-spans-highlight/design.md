# Design — text-spans-highlight

## Shape of the whole thing

```
  author side                      │ frame data              │ renderer
  (pure, deterministic)            │ (Schema, serializable)  │
                                   │                         │
  @lezer parser (user dep)         │                         │
        │                          │                         │
  highlight(code, parser, theme) ──┼─▶ Text { text, spans } ─┼─▶ layoutText(styleRanges)
        │                          │    spans: [{from,to,    │    + mesh styleColors
  select/dim derivation            │      fillColor}]        │    (one mesh, one atlas)
  (span data → span data)          │                         │
```

Lezer runs at authoring time only. Frames carry plain span data; the renderer maps it onto `@text-rendering-toolkit` facilities that already exist (`styleRanges` in layout, `styleColors` on the glyph mesh). No toolkit changes are required.

## Decisions

### Spans on Text, not a Code entity
Line numbers, gutters, backgrounds are user-land composition (a Group of Texts and Rects). A future code-transitions change may still introduce its own surface; nothing here precludes it — the highlight helper and span substrate are what it would reuse.

### Span schema and validation
`spans` is `Schema.optionalKey(Schema.Array(Span))` on the Text struct, `Span = { from: Number, to: Number, fillColor: Color.Color }` (UTF-16 indices, `from` inclusive, `to` exclusive). A struct-level `Schema.check` on Text validates the cross-field rules: each span non-empty, `to <= text.length`, ascending and non-overlapping — failures name the offending span index, per the loud-defect convention.

Grapheme alignment is deliberately NOT schema-validated: core would need `Intl.Segmenter`, whose output can vary across ICU builds — a determinism hazard. The toolkit enforces grapheme boundaries at layout; the renderer adapter wraps that failure in a typed error naming the span. Lezer token boundaries fall on grapheme boundaries for any real source code, so `highlight` output never trips this.

### Renderer mapping: stable style keys by span index
The adapter builds one `TextStyleRange` per span, sharing the entity's font/size, with `key: "s<index>"` — keyed by index, NOT by color. This is what makes color-only animation cheap:

- layout key (re-shape) gains the span boundary list (`from:to` pairs) — boundaries change segmentation, so they must re-layout;
- color key (appearance commit) gains the span color list — `styleColors = { s0: …, s1: … }` updates flow through the existing commit path with no re-shape.

`Text.makeMesh`'s `setColor` grows a span-colors argument (or a sibling setter); the GlyphText already accepts `styleColors` and per-frame updates of it.

Adjacent spans with equal colors stay separate ranges (no merging in the renderer) — `highlight` already emits maximal same-color runs, and dim interpolation depends on span identity staying put.

### `@effect-motion/code` package
- Deps: `@lezer/common`, `@lezer/highlight`, `effect-motion` (peer). Language parsers (`@lezer/javascript`, …) are the caller's dependencies, passed as values — mirroring Motion Canvas's `LezerHighlighter(parser)` without the class.
- `highlight(code, parser, theme)` uses `highlightTree` with a highlighter derived from the theme's tag names; emits `{ text, spans }` with maximal same-color runs. Unthemed tags emit no span.
- Theme: `Record<string, Color.Color>` keyed by `@lezer/highlight` tag names (`keyword`, `string`, `comment`, …). Ship one default theme as a plain exported object. Converters from CodeMirror `HighlightStyle` are future helpers, not in scope.
- Renderer-free: tests run against core alone (mirrors how `packages/react` aliases core source).

### Selection/dim: color mix, not alpha
The glyph mesh's opacity is uniform; per-style alpha does not exist in the toolkit. Dim therefore mixes span colors toward a caller-stated background color (`Color.mix`, Lab — the same interpolation tweens use). Over the solid backdrops code sits on this is visually identical to alpha dimming, and determinism is frame-level, not pixel-level.

`dim(highlighted, ranges, { background, amount, baseColor })` → new span set covering the WHOLE string: kept ranges preserve their colors; everything else — including previously un-spanned text — gets a span with its effective color (`span.fillColor` or `baseColor`) mixed toward `background`. `baseColor` is required because the helper cannot see the entity's `fillColor`.

ponytail: per-style opacity in `@text-rendering-toolkit` is the upgrade path if dim over non-solid backgrounds ever matters; recorded there, not blocking here.

### Animated selection rides `Motion.drive`
`selectTo(instance, ranges, { duration, timing, background, amount, baseColor })` computes the target span set, captures the current one at start, and uses the existing `Motion.drive(instance, duration, timing, fn)` per-frame driver to write interpolated spans via `Scene.update`. Interpolation is per-character effective color mixed by `t`, re-emitted as maximal runs; the final frame writes the exact target set (duration animations land exactly — house invariant). No core changes: `drive` is already public and phaser-synchronized.

### Ligatures
Style ranges split shaping segments, so cross-boundary ligatures simply never form; within a span the font behaves normally. That is the desired behavior and costs nothing — one renderer test pins it.

## What could go wrong

- **Span count churn**: an animated dim re-emits runs per frame; if run boundaries shift (colors converging), span count changes per frame → layout key must depend on boundaries only, and interpolation must keep boundaries FIXED during a single animation (union of start/target boundaries, computed once at start) so only colors move. The design above requires this of `selectTo`.
- **Toolkit version**: renderer's `@text-rendering-toolkit` dependency must be at a version whose `styleRanges`/`styleColors` ship in the published package — verify before assuming the sibling checkout matches npm.
- **Default font coverage**: themes are color-only, no font switching per span — bold/italic token styles are out of scope (would need per-span font keys; a future field).
