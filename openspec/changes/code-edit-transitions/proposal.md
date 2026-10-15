## Why

Highlighted code (shipped in text-spans-highlight) shows a snippet; a code *explainer* evolves one — an argument gets extracted, a line appears, a call is renamed — and the viewer should watch the unchanged code slide into place while removals fade out and insertions fade in, Motion-Canvas-style. Today that means hand-animating individual Texts per edit.

The substrate makes this cheap now: monospace code on a never-wrapping grid means every position is `(line, column)` arithmetic — no text measurement — so edit transitions decompose entirely into existing primitives (`Group`, per-line `Text` with spans, `moveTo`/`fadeTo`, `Scene.all`). This lands as authoring-time composition in `@effect-motion/code`: zero core changes, zero renderer changes, per AGENTS.md's "the engine renders, it does not parse".

Where the API deliberately differs from Motion Canvas: edits are expressed by passing the full new source and letting a **deterministic automatic diff** plan the transition — no edit-marker template DSL. And there is no bespoke Code node: a block is an ordinary `Group` of `Text`s, so every standard animator already works on it.

## What Changes

- `Code.block` in `@effect-motion/code`: instantiate a code block — a `Group` handle plus one `Text` per line (with highlight spans), positioned on a monospace grid declared as em ratios (`charWidth`, `lineHeight`) of `fontSize`. Lines NEVER wrap — the grid invariant; block layout requests no wrap width.
- `Code.gridFromFont(bytes)`: derive exact grid ratios from real font metrics via `@text-rendering-toolkit/font`, exposed as a separate entry point so its WASM stays out of bundles that declare the grid manually.
- `Code.editTo(block, newCode, options)`: animate to a new source string. A deterministic diff (line-level LCS, then token-level diff within changed lines, then a token-migration pass pairing identical removed/inserted tokens across lines) plans the transition: kept fragments slide (including across lines), removals fade out, insertions fade in, and recolored tokens tween their color mid-slide. All motions run concurrently and land frame-exactly; the block's rest state after the edit is per-line Texts carrying the new highlight.
- Rest/transition lifecycle: per-line Texts between edits; affected lines split into fragment Texts only while a transition runs (the split and the post-edit consolidation are visually invisible — identical frame content), so instance count stays bounded at rest.
- `Code.selectTo(block, ranges, options)`: the selection dim from `code-highlight`, lifted to block coordinates (whole-source ranges mapped onto per-line spans).
- Docs: a runnable edit-transition example and a guide section.

Explicit non-goals: no edit-marker template DSL (the automatic diff is the API; markers can layer on later if it ever guesses wrong); no line wrapping (out of scope by design — compositions are sized to the code); no proportional-font code blocks; no semantic/AST-aware diffing (the diff is textual and deterministic); no core or renderer changes.

## Capabilities

### New Capabilities

- `code-transitions`: code blocks in `@effect-motion/code` — the grid model and `block` builder, font-derived grid metrics, the automatic diff semantics, the `editTo` transition animation and its rest/transition lifecycle, and block-level selection.

### Modified Capabilities

<!-- none — code-highlight is consumed unchanged; no core or renderer requirement changes -->

## Impact

- `packages/code` — new modules (block builder, grid, diff, edit animator, block selection); new entry point for the font-metrics helper with `@text-rendering-toolkit/font` as its dependency (isolated so the ~390 KB WASM is only pulled by importers of that entry).
- `apps/docs` — one new runnable example plus guide content.
- No changes to `packages/motion`, `packages/renderer`, or `@text-rendering-toolkit` (metrics are already exposed by its `/font` package).
