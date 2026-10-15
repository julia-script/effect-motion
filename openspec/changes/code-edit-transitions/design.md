# Design — code-edit-transitions

## Shape of the whole thing

Everything is authoring-time composition over primitives that already exist. No core changes, no renderer changes, no new entity.

```
              @effect-motion/code (new modules)
┌────────────────────────────────────────────────────────────┐
│  Block.ts     block(), the handle, grid math, lifecycle    │
│  Diff.ts      line LCS → token diff → migration pairing    │
│  Edit.ts      editTo(): plan → split → animate → merge     │
│  Metrics.ts   gridFromFont() (separate entry, WASM dep)    │
│  (Selection)  block selectTo lifted over lines             │
└──────────────┬─────────────────────────────────────────────┘
               │ emits / drives
┌──────────────▼─────────────────────────────────────────────┐
│  Group ─┬─ Text line 0 (spans)      Motion.moveTo/fadeTo   │
│         ├─ Text line 1 (spans)      Scene.all / stagger    │
│         └─ …                        Scene.appendChild/rm   │
└────────────────────────────────────────────────────────────┘
```

## Decisions

### The grid invariant: lines never wrap
Recorded as a hard invariant, not a preference. Every position is `(line, col) → (col·charWidth·fontSize, −line·lineHeight·fontSize)` (y-up: lines grow downward as negative y). This arithmetic is only sound because a source line is exactly one visual line; block layout never requests a wrap width, and nothing in the diff/animation model handles a wrapped line. Compositions are sized to the code.

### The block handle
`Code.block(options)` is an effectful builder (yields inside a scene): instantiates the Group and per-line Texts, returns a handle carrying the Group instance plus authoring state (current source, current `Highlighted`, line instances, grid, fontSize, theme, parser). Later `editTo`/`selectTo` calls read and update this state.

Handle state is authoring-time bookkeeping, mutated as the scene generator advances — deterministic because scene generation is. One consequence to document: an `editTo` captured inside `Scene.repeat` diffs against the block's *current* source, so the second iteration is a no-op edit (v2 → v2). That is the honest semantics of "diff from current"; scenes that loop an edit should rebuild the block per iteration.

Per-line Texts use `textAnchor: "start"` and `baseline: "hanging"` so a line's grid position is its top-left; the line's spans are the whole-source spans sliced to the line and re-based to line-local indices.

### The diff (Diff.ts) — plain code, no dependency
1. **Line LCS** over exact line strings. Unchanged lines map old index → new index (vertical slides, whole-Text move, no split). Everything else forms change groups.
2. **Token diff within a change group**: token boundaries are the union of highlight-span edges, whitespace edges, AND word/non-word transitions (`bar(x` is `bar` `(` `x` — color runs alone glue unthemed code into un-animatable lumps; same-color punctuation runs like `();` and `=>` stay together so ligatures survive inside a fragment). LCS over token text yields kept (slides, with a color tween when the token recolors), removed, inserted.
3. **Migration pass**: identical removed/inserted RUNS (adjacent tokens, exact source slice, elementwise colors) pair first-match-in-source-order and slide across lines; a token-level fallback then pairs leftover identical tokens of 2+ characters one-to-one (single characters are excluded — a lone paren flying across the block reads as noise). `ponytail:` first-match pairing is a deterministic heuristic, not semantic matching — an AST-aware matcher is the upgrade path if refactor-style edits ever pair wrongly.

Determinism: pure functions of the two strings plus the highlight; no randomness, no wall clock.

### The transition (Edit.ts)
`editTo(block, newCode, { duration, timing })`:

1. Highlight `newCode`; run the diff; build the plan (fragment → source/target grid positions, colors, class).
2. **Split** (one frame, invisible): for each affected line, remove the line Text and instantiate fragment Texts at identical grid positions with identical sliced spans — same glyphs, same colors, so the frame content is unchanged. Untouched-but-shifted lines stay whole.
3. **Animate** with one `Scene.all`: `moveTo` kept/migrated fragments to target positions (`tweenTo` fillColor alongside when the token's color changes); `fadeTo(0)` removed; inserted fragments instantiate at target with `opacity: 0` and `fadeTo(1)`. Same duration and timing for every motion (Motion-Canvas feel); a stagger variant is userland composition on top.
4. **Consolidate** (one frame, invisible): drop removed instances, replace fragments with fresh per-line Texts carrying the new highlight, update handle state. The exactness invariant — the post-consolidation frame equals a fresh `block(newCode)` — is what the spec's "final frame is exact" scenario pins.

Instance ids come from the runner's deterministic sequence, so churn is reproducible run to run.

### `gridFromFont` (Metrics.ts, separate entry point)
Uses `@text-rendering-toolkit/font` (verified in 0.3.0): `FontHandle.facts` exposes `unitsPerEm`, `ascender`, `descender`, `lineGap`; shaping `"0"` gives the monospace advance. `charWidth = advance / unitsPerEm`, `lineHeight = (ascender − descender + lineGap) / unitsPerEm`. Async (WASM init) — it runs in userland preprocessing next to where font bytes already live (the loader-layer setup), never inside a scene body. The dependency sits on the `Metrics` entry only; `package.json` exports keep it out of the main entry's graph so bundlers skip the ~390 KB WASM for manual-grid users.

### Block selection
`Code.selectTo(block, ranges, options)` maps whole-source ranges to per-line ranges and drives each line Text with the existing single-Text selection machinery, wrapped in one `Scene.all`. `baseColor` defaults to the block's ink color (the handle knows it — one ergonomic win over the single-Text API).

## What could go wrong

- **Split/consolidate visibility**: the invisibility claim depends on a fragment Text at grid position rendering byte-identically to the same characters inside the line Text. Frame-level it holds (same font, size, anchor, colors, grid-exact positions); pixel-level, monospace advances make the glyph positions genuinely identical. One renderer-level test should pin the layout equivalence (fragment x offsets equal in-line glyph x offsets), since a kerning-active proportional font would break it — another reason the monospace invariant is hard.
- **Diff pathologies**: heavily repeated tokens (`}` lines) can migrate confusingly. Line-LCS anchoring bounds this (only unmatched lines enter token diff); accept the remainder as heuristic behavior.
- **Concurrent edits on one block**: two overlapping `editTo`s would fight over handle state. First cut: document as unsupported; a loud defect (edit-in-progress flag on the handle) is one line.
