# code-transitions Delta

## Purpose

Code blocks that evolve: a monospace-grid block of highlighted code lines that transitions between source versions by animating what a deterministic diff found — unchanged tokens slide (including across lines), removals fade out, insertions fade in — composed entirely from existing entities and animators at authoring time.

## ADDED Requirements

### Requirement: A code block is ordinary instances on a monospace grid
`block` SHALL instantiate a code block as a `Group` containing one `Text` per source line, each carrying the line's slice of the highlight spans, positioned by grid arithmetic alone: line `l`, column `c` sits at `(c × charWidth × fontSize, −l × lineHeight × fontSize)` relative to the block origin, where `charWidth` and `lineHeight` are em ratios. Lines SHALL NEVER wrap — no wrap width is ever requested, and a source line renders as exactly one visual line. The returned handle SHALL expose the `Group` instance so every standard animator (move, fade, and the rest) applies to the whole block unchanged.

#### Scenario: Block instantiates as per-line Texts
- **WHEN** `block` runs with three-line source, a parser, a theme, and a grid
- **THEN** the scene contains a Group with three Text children, each at its computed line offset, each carrying that line's highlight spans

#### Scenario: The block animates as one unit
- **WHEN** the block handle's group is animated with `Motion.moveTo` and `Motion.fadeTo`
- **THEN** the whole block moves and fades like any Group subtree

#### Scenario: Long lines never wrap
- **WHEN** a source line is wider than the composition
- **THEN** it renders as one visual line extending past the edge; no layout wrapping occurs

### Requirement: Grid metrics derive from real font metrics
`gridFromFont` SHALL derive the grid's `charWidth` and `lineHeight` em ratios from a monospace font's actual metrics (advance width and `unitsPerEm`, ascender/descender/line-gap) given the font's bytes. The derivation SHALL be deterministic per font bytes. It SHALL live in a separate entry point whose font-parsing dependency (and its WASM asset) is only loaded by importers of that entry — declaring a grid manually SHALL NOT pull it in.

#### Scenario: Derived grid matches the font
- **WHEN** `gridFromFont` runs over a monospace font's bytes
- **THEN** the returned `charWidth` equals the font's glyph advance divided by its units-per-em, and `lineHeight` equals (ascender − descender + line gap) divided by units-per-em

#### Scenario: Manual grids skip the font machinery
- **WHEN** a block declares `grid: { charWidth, lineHeight }` directly
- **THEN** no font-parsing code loads

### Requirement: Edits diff automatically and deterministically
`editTo(block, newCode, options)` SHALL accept the complete new source string and plan the transition from a deterministic textual diff: line-level longest-common-subsequence first, token-level diff within changed line groups second, and finally a migration pass that pairs identical removed/inserted token runs across lines (first match in source order) so a token moving to another line slides instead of fading. The same before/after sources SHALL always produce the same plan. There SHALL be no edit-marker DSL.

#### Scenario: Same edit, same plan
- **WHEN** the same before and after sources are diffed twice
- **THEN** the fragment classifications (kept, removed, inserted, migrated) are identical

#### Scenario: Extracting an expression migrates it
- **WHEN** an edit removes a token run from one line and an identical run appears on another line
- **THEN** the plan classifies it as one migrated fragment (slide), not a removal plus an insertion

### Requirement: Edit transitions animate through standard animators, frame-exactly
An edit SHALL animate its plan concurrently over the given duration: kept and migrated fragments slide to their target grid positions (tweening fill color when their token color changes), removed fragments fade out, inserted fragments fade in from transparent. Motion SHALL ride the standard animators, composing with scene combinators, and the final frame SHALL land exactly on the new source's highlight. Determinism invariants apply: same inputs, same frames.

#### Scenario: An inserted line pushes lines down
- **WHEN** an edit inserts one line in the middle of a block
- **THEN** the lines below slide down by one line height while the new line fades in, and the final frame shows the new source fully highlighted

#### Scenario: Final frame is exact
- **WHEN** an edit of any shape completes
- **THEN** the last frame's block content equals what `block` would produce fresh from the new source — positions and spans exactly

### Requirement: Rest state stays per-line; fragments exist only mid-transition
Between edits a block SHALL consist of exactly one Text per line. When an edit begins, affected lines split into fragment Texts, and when it ends they consolidate back into per-line Texts — both the split frame and the consolidation frame SHALL be visually identical to their neighbors (same glyph positions, same colors), so the lifecycle is invisible. Lines untouched by an edit whose position shifts SHALL slide as whole line Texts without splitting.

#### Scenario: Split and consolidation are invisible
- **WHEN** an edit transition runs
- **THEN** no frame shows a visual discontinuity at the split or consolidation boundaries

#### Scenario: Instance count is bounded at rest
- **WHEN** a block has completed any number of edits
- **THEN** its subtree contains exactly one Text per current source line

### Requirement: Selection lifts to block coordinates
A block-level selection SHALL accept character ranges in whole-source coordinates and apply the `code-highlight` selection semantics across the block's lines: characters in the ranges keep their colors, all other characters dim toward the stated background, animated frame-exactly. Ranges MAY span multiple lines.

#### Scenario: A multi-line range dims the rest
- **WHEN** a block selection covers a range spanning two lines
- **THEN** those characters keep full color across both lines and every other character in the block dims
