# text-animation Specification

## Purpose

Progressive, edit-aware text animation layered on the rich-text `Shapes.Text`
entity: a reusable rich-text diff, and a typewriter animator that reveals and
rewrites text the way a person types.

## Requirements

### Requirement: Rich-text linearisation

The library SHALL provide `RichText.flatten(content, granularity?)` turning a
`Shapes.TextContent` (a plain string or an mdast-subset tree) into an ordered list
of units. A unit is either a cluster (grapheme by default, or word) carrying its
accumulated `strong`/`emphasis` marks, or a paragraph-`break` marker. Clusters
SHALL come from `Intl.Segmenter` under a fixed locale so segmentation is
deterministic, and a cluster SHALL never straddle a mark boundary.

#### Scenario: Marks follow the tree, not the node split
- **WHEN** `he` followed by a `strong` run `llo` is flattened
- **THEN** the units are `h,e` unmarked and `l,l,o` marked strong, as one stream

#### Scenario: Paragraphs become breaks
- **WHEN** a two-paragraph root is flattened
- **THEN** exactly one `break` unit separates the two paragraphs' clusters

### Requirement: Rich-text rebuild is canonical and inverse

The library SHALL provide `RichText.rebuild(units)` producing a `TextContent`:
`break`s split paragraphs, and maximal runs of equal-mark clusters coalesce into
`text`/`strong`/`emphasis` nodes with `strong` nesting outside `emphasis`. A
single unmarked paragraph SHALL rebuild to a plain string; no units SHALL rebuild
to `""`. `rebuild(flatten(x))` SHALL be a canonical form (idempotent under
re-flatten).

#### Scenario: Round-trip canonicalises
- **WHEN** a tree using `emphasis`-outside-`strong` nesting is flattened and rebuilt
- **THEN** the result is semantically equal with `strong` outside `emphasis`, and flattening it again yields the same units

#### Scenario: Plain text stays plain
- **WHEN** units with no marks and no breaks are rebuilt
- **THEN** the result is a plain `string`, not a `root` tree

### Requirement: Rich-text diff

The library SHALL provide `RichText.diff(from, to)` returning an ordered list of
`keep`/`delete`/`insert` ops over units, where two units are equal only if same
kind, same cluster, and same marks. The kept units in order SHALL form a longest
common subsequence; applying deletes then inserts SHALL transform `from` into
`to`.

#### Scenario: Common prefix and suffix are kept
- **WHEN** `cat` is diffed to `cut`
- **THEN** `c` and `t` are `keep`, `a` is `delete`, `u` is `insert`

#### Scenario: Formatting change is a retype
- **WHEN** plain `hi` is diffed to `strong` `hi`
- **THEN** the plain units are deleted and the strong units inserted, none kept

### Requirement: Realistic keystroke planning

The library SHALL provide `Typewriter.keystrokes(from, to, options?)` returning an
ordered list of intermediate `TextContent` states, one per keystroke, each tagged
`delete` or `insert`, ending exactly at `to`. It SHALL process change regions left
to right and, within each region, backspace the removed units one at a time and
then type the inserted units one at a time, leaving text outside the region in
place. Equal `from` and `to` SHALL produce no keystrokes.

#### Scenario: Reveal from empty
- **WHEN** planning from `""` to `"Hi"`
- **THEN** the states are `"H"` then `"Hi"`, both `insert`

#### Scenario: In-place edit keeps the suffix
- **WHEN** planning from `cat` to `cut`
- **THEN** the states are `ct` (`delete`) then `cut` (`insert`) — the `t` is never retyped

#### Scenario: Independent edits stay local
- **WHEN** planning from `cat and dog` to `cut and dig`
- **THEN** the first region is edited to completion before the second, and the text between them never changes

### Requirement: Typewriter animator

The library SHALL provide the `typewrite` / `typewriteTo` pair over entities whose
data has a `text: TextContent` field. `typewriteTo(instance, to, options?)` SHALL
read the origin from the instance's current `text`; `typewrite(instance, from, to,
options?)` SHALL start from the explicit `from`. Both SHALL support data-first and
pipeable forms (dispatching on whether the first argument is an Instance), apply
each planned keystroke via a scene update held for a whole number of frames, and
resolve with the instance. Typing and backspacing speeds SHALL be independently
configurable; optional per-key jitter SHALL be drawn from the scene's seeded
`Random` (never wall-clock). The final frame SHALL land exactly on `to`; an empty
diff SHALL add no keystroke frames of its own (the scene's own final-state frame
still stands).

#### Scenario: Types over frames onto the target
- **WHEN** `instance.pipe(Typewriter.typewriteTo("Hi"))` runs on a Text currently empty
- **THEN** successive frames show `H` then `Hi`, and the final frame's text is exactly `Hi`

#### Scenario: Jitter is deterministic
- **WHEN** the same jittered typewrite runs twice under the same seed
- **THEN** the per-keystroke frame counts are identical

#### Scenario: No-op when unchanged
- **WHEN** `typewriteTo` targets text equal to the instance's current text
- **THEN** it resolves with the instance and ticks no frames of its own
