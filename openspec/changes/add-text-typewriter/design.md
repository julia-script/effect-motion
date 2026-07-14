# Design: add-text-typewriter

## The unit representation

Diffing rich text directly on the tree is awkward: the same visible sentence can
be split across inline nodes (`he` + **`llo`**), and edits cross those
boundaries. So we linearise first.

A **unit** is the atom of both diffing and typing:

```ts
type Marks = { readonly strong: boolean; readonly emphasis: boolean };
type Unit =
  | { readonly kind: "grapheme"; readonly cluster: string; readonly marks: Marks }
  | { readonly kind: "break" }; // a paragraph boundary — like pressing Enter
```

- **`flatten(content, granularity)`** walks the tree depth-first, segmenting each
  inline text node's string with `Intl.Segmenter` (fixed `"en"` locale for
  determinism) and tagging every cluster with the marks accumulated from its
  `strong`/`emphasis` ancestors. Paragraph boundaries become a single `break`
  unit. Segmenting *per inline node* means a unit never straddles a mark boundary
  — a word that visually spans bold/plain simply becomes two units (rare, and
  harmless).
- **`rebuild(units)`** is the inverse: split on `break`s into paragraphs, then
  coalesce maximal runs of equal-mark graphemes back into `text`/`strong`/
  `emphasis` nodes. Nesting is canonical — `strong` outer, `emphasis` inner — so
  `rebuild(flatten(tree))` is an idempotent *canonicalisation* (tested). A single
  unmarked paragraph rebuilds to a plain `string`, matching how such text is
  authored; empty units rebuild to `""`.

Unit equality (used by the diff) is character **and** marks: turning `bold`
plain is a delete+insert (a retype), which is what actually happens when you
can't reformat by typing — the realistic model.

## The diff

`diff(from, to): Op[]` where `Op` is `{ op: "keep"|"delete"|"insert"; unit }`.
An in-house longest-common-subsequence backtrack (O(n·m) DP). Text animated this
way is short (captions, titles — tens to low hundreds of units), so the quadratic
table is fine; a `ponytail:` marker records the Myers O(n·d) upgrade path if long
documents ever matter. The result preserves order; within a change region the
split of deletes vs. inserts is normalised by the planner, so the diff only has
to be *correct*, not order-canonical.

## The keystroke planner (`Typewriter.keystrokes`)

The realism requirement — "backspace one change, write it, move to the next
change; don't backspace everything and retype" — is exactly *apply the diff one
change region at a time, in place*.

Group the op stream into segments: `keep` runs and `change` runs (a maximal run
of deletes/inserts, its deletes and inserts gathered separately). At any moment
the visible text is `before ++ middle ++ suffix`:

- `before` — units already finalised to their **new** value (left of the cursor),
- `suffix` — units to the right still in their **old** value (`keep` units plus
  not-yet-reached deletes), precomputed per segment,
- `middle` — the region under edit.

Walking segments left to right:

- a `keep` run appends its units to `before` (no keystroke — untouched text isn't
  retyped);
- a `change` run emits one intermediate state per keystroke: first backspaces,
  removing its deleted units one at a time from the tail (`before ++ dels[0..k] ++
  suffix`, k decreasing), then types, adding inserted units one at a time
  (`before ++ ins[0..j] ++ suffix`, j increasing). Each state is materialised
  with `rebuild`. Then `before` gains the inserted units and we move on.

So `cat → cut` yields `ct` (drop the `a`) then `cut` (type the `u`) — the `t` is
never touched. Two independent edits (`cat and dog → cut and dig`) are handled as
two local regions, the text between them left alone. Typing from empty (`"" →
"Hello"`) is a pure-insert region: the classic letter-by-letter reveal is just
the degenerate case, no special path.

`keystrokes` is pure and returns `{ content, kind: "delete" | "insert" }[]`
(kind drives pacing). It is unit-tested independently of any scene.

## The animator

`typewrite` / `typewriteTo` follow the house base/To + dual conventions (dispatch
by `Instance.isInstance`, resolve with the instance so they chain):

- `typewriteTo(instance, to, options?)` reads the origin from the instance's
  current `text`; `typewrite(instance, from, to, options?)` takes an explicit
  origin (and sets it first, mirroring `tween`'s explicit-from behaviour).
- The entity is constrained at the type level to have a `text: TextContent` field;
  a plain-JS misuse still dies loudly via the field access.

Each planned keystroke is applied with `Scene.update` and held for a whole number
of frames derived from the frame rate and the configured speed: `cps` for typing,
`deleteCps` (default faster) for backspacing — backspacing reads faster than
typing, as it does for real. Optional `jitter` (0..1) perturbs each hold by a
factor drawn from the scene's **seeded** `Random`, so realistic unevenness stays
deterministic (same seed → same frames). `granularity: "word"` types whole words.

Determinism invariants are honoured: the final keystroke's state is exactly `to`
(the planner ends there) and is held ≥1 frame, so the animation lands frame-exact
on target; an empty diff (`from` equals `to`) is a no-op that ticks no frames of
its own and just resolves with the instance (the scene still emits its normal
trailing final-state frame).

## Alternatives considered

- **A diffing library (`jsdiff`, `fast-diff`).** Rejected: adds a runtime
  dependency to a core that deliberately pins `effect` for determinism, and none
  diff arrays with custom (mark-aware) equality without adapting anyway. The LCS
  is small and fully under our control.
- **A caret / cursor entity.** Out of scope for v1. Rendering the full
  intermediate string already reads as typing; a blinking caret can layer on later
  without changing the planner.
- **Per-unit positioning (each glyph placed).** Explicitly a non-goal — it needs
  text measurement, which the roadmap keeps out of scope. This helper reveals
  *content*, not glyph positions.
