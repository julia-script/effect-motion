## Why

Motion-graphics explainers live and die on code: showing a snippet, coloring it by syntax, and directing the viewer's eye by highlighting some ranges while dimming the rest. Today a Text is a single-color string, and the documented workaround — composing several Texts — cannot actually work because core cannot measure text, so nothing can place the second Text after the first. Per-range color inside one Text is the missing primitive.

The render substrate already exists: `@text-rendering-toolkit` lays out per-range style overrides (`styleRanges`, each glyph tagged with its `styleKey`) and its glyph mesh colors per style key (`styleColors`) — one mesh, one layout, one atlas. effect-motion's renderer adapter just doesn't expose it.

Syntax highlighting itself stays author-side: a Lezer parse is pure and deterministic, so tokenization happens during scene authoring and frames carry only plain span data. The renderer never learns what a "language" is, language grammars stay in user land, and the same helper later feeds Motion-Canvas-style code edit transitions (a separate, future change).

## What Changes

- `Text` gains an optional `spans` field: non-overlapping `{ from, to, fillColor }` ranges over the string, coloring those characters instead of the entity `fillColor`. Text stays a plain-string leaf — spans are an overlay, not a rich tree.
- The renderer maps spans onto the toolkit's `styleRanges`/`styleColors`: per-range color in a single glyph mesh. Span boundaries split shaping segments, so ligatures never form across a span boundary (within a span they behave as before).
- New package `@effect-motion/code`: Lezer-based highlighting that produces span data.
  - `highlight(code, parser, theme)` → `{ text, spans }` ready to spread into a Text. The caller supplies the `@lezer/*` language parser; the package depends only on `@lezer/common` + `@lezer/highlight`.
  - Themes are plain serializable objects mapping highlight-tag names to Colors (adapters for e.g. CodeMirror `HighlightStyle` can come later).
  - Selection/dim helpers: derive a new span set where given ranges keep their color and everything else mixes toward a background color. Animated dim rides on the fact that span colors are plain Colors — the helper interpolates span sets frame-exactly like any tween.
- Docs example: a highlighted snippet with an animated selection sweep.

Explicit non-goals: no `Code` entity (line numbers, gutters, backgrounds are user-land composition); no code edit/diff transitions (future change, this one only makes sure span data doesn't preclude it); no per-span opacity in the glyph pipeline — dim is color-mix toward a stated background, which is visually identical over the solid backdrops code sits on (per-style alpha in the toolkit is the recorded upgrade path).

## Capabilities

### New Capabilities

- `code-highlight`: the `@effect-motion/code` package — Lezer tokenization to Text spans, plain-object themes, selection/dim span derivation and its animated form.

### Modified Capabilities

- `text-entity`: the "plain or rich inline content" requirement changes — `text` remains a plain string, but an optional `spans` overlay assigns per-range fill colors; validation rules for span ranges (in-bounds, non-overlapping, grapheme-aligned) become entity-level behavior.
- `three-text`: new requirement — spans render as per-range colored glyphs in a single mesh sharing the entity's font, size, anchoring, opacity, and depth behavior; span boundaries bound ligature formation.

## Impact

- `packages/motion` — `Entity.ts`: `spans` field on the Text schema (optional, absent by default; existing scenes unaffected).
- `packages/renderer` — `Text.ts` adapter grows span input (`styleRanges` + `styleColors`); `Builtins.ts` text renderer includes spans in its layout/color change keys.
- New `packages/code` — published as `@effect-motion/code`; deps `@lezer/common`, `@lezer/highlight`; language parsers are the user's own dependencies. Renderer-free, so it typechecks/tests against core alone.
- `@text-rendering-toolkit` — no changes required; `styleRanges`/`styleColors` already ship. Per-style opacity is a noted future toolkit feature, not a blocker.
- `apps/docs` — one new runnable example registered in `examples/registry.ts`.
- Stale spec noted in passing: `text-entity` still carries a "renders to SVG" requirement from the pre-WebGPU renderer; not touched by this change, flagged for a separate spec sync.
