# Tasks — code-edit-transitions

## 1. Grid and block

- [x] 1.1 `Block.ts` in `packages/code`: grid math (em ratios → y-up offsets), `block(options)` builder instantiating the Group + per-line Texts with line-sliced spans (`textAnchor: "start"`, `baseline: "hanging"`), handle carrying group instance + authoring state
- [x] 1.2 `Metrics.ts` as a separate package entry: `gridFromFont(bytes)` via `@text-rendering-toolkit/font` (`charWidth` from the shaped advance, `lineHeight` from facts); wire `package.json` exports so the font dep loads only from this entry
- [x] 1.3 Tests: block structure (per-line Texts at grid offsets, spans sliced and re-based), whole-block move/fade through standard animators, no-wrap invariant (no wrap width requested), `gridFromFont` against a known monospace font's real metrics

## 2. Diff

- [x] 2.1 `Diff.ts`: line-level LCS, token boundaries from span ∪ whitespace edges, token-level LCS within change groups, first-match migration pairing of identical removed/inserted runs; plan output (kept/removed/inserted/migrated with source/target grid positions and colors)
- [x] 2.2 Tests: determinism (same inputs, deeply equal plans), insert-a-line (pure vertical slides below), intra-line rename (kept prefix/suffix slide, changed token fades), extract-to-variable (migration pairs across lines), pathological repeated-token input stays deterministic

## 3. Edit transition

- [x] 3.1 `Edit.ts`: `editTo(block, newCode, { duration, timing })` — plan, invisible split of affected lines into fragment Texts, one `Scene.all` of moveTo/fadeTo/color tweens, invisible consolidation into fresh per-line Texts, handle-state update; loud defect on overlapping edits of one block
- [x] 3.2 Tests via `Scene.stream`: final frame equals a fresh `block(newCode)` (positions and spans exactly), no visual discontinuity at split/consolidate boundaries (frame N−1 vs N content), instance count returns to one Text per line, re-run reproduces identical frames
- [x] 3.3 Renderer-level test pinning layout equivalence: a fragment Text at its grid position has glyph x offsets equal to the same characters inside the whole-line Text (monospace font)

## 4. Block selection

- [x] 4.1 `selectTo(block, ranges, options)`: whole-source ranges → per-line ranges, existing single-Text selection driven per line under one `Scene.all`; `baseColor` defaults from the block's ink color
- [x] 4.2 Tests: multi-line range keeps color across lines while the rest dims; frame-exact landing

## 5. Docs

- [x] 5.1 Runnable example: a block that plays two or three edits (insert a line, rename a call, extract an expression) with a selection beat between them; register in `examples/registry.ts`
- [x] 5.2 Extend the code guide (or add a page): blocks, `gridFromFont` vs manual grids, `editTo`, the never-wrap invariant, the repeat-semantics note
