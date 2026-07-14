# Proposal: add-text-typewriter

## Why

The roadmap's Next bet **Text animation helpers** calls for typewriter reveals —
"the bread and butter of text animation" — which today require manual scene
gymnastics (slicing the string yourself and `Scene.update`-ing it frame by
frame, with no notion of formatting or of editing existing text). Rich text v1
shipped 2026-07-13, so a helper layered on it is unblocked.

A naive reveal (append one grapheme per frame) only covers typing from empty.
The more useful — and more common in motion graphics — case is *changing* text:
a caption morphs from one line to the next. Retyping the whole line looks robotic.
A person editing text backspaces only what changed, in place, one region at a
time. Capturing that requires a diff, and the diff must operate on rich text so a
sentence split across multiple inline nodes (`he`**`llo`**) is handled as one
stream, not per node.

## What Changes

- **New `RichText` module (pure, reusable).** Flattens a `Shapes.TextContent`
  tree into a linear list of *units* — grapheme (or word) clusters each carrying
  their mark context (`strong`/`emphasis`) plus paragraph-break markers — using
  `Intl.Segmenter`. Rebuilds a canonical tree from units. Diffs two unit lists
  into a keep/delete/insert edit script via an in-house LCS. Reusable beyond the
  typewriter (markdown authoring, text morphs, future per-run styling).
- **New `Typewriter` module.** A pure `keystrokes(from, to, options?)` planner
  that turns the edit script into a realistic keystroke timeline: it walks change
  regions left to right, and for each region backspaces the removed units then
  types the inserted ones, leaving untouched text in place — so multiple separate
  edits are handled one region at a time, not backspace-everything-then-retype.
  On top of it, the `typewrite` / `typewriteTo` animator pair drives an entity's
  `text` field over frames.
- Typing pace is configurable (typing vs. backspacing speed) with optional
  **seeded** per-key jitter (drawn from the scene's `Random`, never wall-clock),
  keeping scenes deterministic. Word-granularity reveals fall out of the same
  planner via `Intl.Segmenter`'s word mode.
- No new runtime dependency. The diff is a ~40-line LCS; adding `jsdiff`/`fast-diff`
  to the published core (which pins `effect` for determinism) is not worth it for
  this size, and neither handles custom unit equality (marks) out of the box.

## Capabilities

### New Capabilities

- `rich-text-diff`: flatten/rebuild/diff over the rich-text tree.
- `text-typewriter`: the keystroke planner and the `typewrite`/`typewriteTo`
  animators.

### Modified Capabilities

None. `Shapes.Text` and its schema are untouched; the animator writes the
existing `text` field.

## Impact

- New: `packages/motion/src/RichText.ts`, `packages/motion/src/Typewriter.ts`.
- New tests: `packages/motion/test/richtext.test.ts` (flatten/rebuild/diff),
  `packages/motion/test/typewriter.test.ts` (keystroke planner + animator).
- `packages/motion/src/index.ts`: export `RichText`, `Typewriter`.
- New docs example: `apps/docs/examples/typewriter.scene.ts` + registry entry.
- No API break, no new dependency, no player/renderer change.
