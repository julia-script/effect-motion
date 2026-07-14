## Why

The docs are the front door for a quiet v0.1 — a stranger who finds effect-motion must be able to learn it unassisted, and today they can't fully. The example *coverage* is decent (14 live scenes), but the *conceptual* coverage has real holes: the entity/instance lifecycle the recent refactor introduced (`children`, `$visible`, `appendChild`/`removeChild`, `update`) is undocumented, nested scenes (`play`), extensibility (custom entities, sinks), the frame model, and the React player have zero doc presence, and the structure is a flat example gallery rather than a concept spine you can learn from. This is the last committed item before publish.

## What Changes

- **Restructure the docs into a concept spine.** Replace the flat example-first navigation with **Core Concepts** (Scenes & the frame model, Entities & instances, Animators, Physics, Timing & easing, Composition, Determinism) and **Going Further** (Custom entities, Rendering & sinks, React Player, Export, Fonts), plus Introduction / Getting started / an Examples gallery / Patterns. Every public symbol gets a documented home.
- **Embed examples inline in concept pages.** The 14 existing `examples/*.scene.ts` move from a standalone gallery into the concept pages they illustrate, via the existing drift-proof `<Example name>` component (source read from the executed file at build time — no scene files move, no registry change). A concept page may embed several.
- **Document the entity/instance lifecycle** (from the `refactor-text-and-children` change): polymorphic `children`, `$visible`, `Scene.appendChild`/`removeChild`, `Scene.update`/`data`, and `Text` as a plain-string leaf composed via children.
- **Document nested scenes & advanced composition**: `Scene.play` (nested scenes), `Scene.finish`, and `repeat` with schedules as first-class concepts (not just examples).
- **Document extensibility**: `Entity.make` with a custom render function and trait lenses; `SvgRenderer` (self-contained string) vs `SvgDomRenderer` (live DOM).
- **Document the frame model & React player**: `Scene.run`/`stream`/`step` and `Settings` in the Scenes page; `usePlayer`/`Player` as a short page under Going Further (live consumption, paired with Export as file consumption).
- **Accuracy pass** across all existing pages so they reflect the post-refactor API (plain-string `Text`, children-defined structure, bundled ffmpeg in export) — not the pre-refactor shape.
- **A few new small example scenes** for the genuinely new APIs (a `children` composition demo, an `appendChild` reparent demo, a custom-entity demo); most existing scenes only relocate.
- A **Patterns** page of "how do I…" recipes (loop forever, crossfade, stagger into a group, compose styled text now that rich text is gone). Lower priority — fast-follow if time is tight.
- **Not in scope:** a generated API reference (per-symbol signatures). A TSDoc-cleanup + generated-reference pass is deferred to a later change.

## Capabilities

### New Capabilities
_None — this is documentation of existing library capabilities, tracked under the `docs-site` capability._

### Modified Capabilities
- `docs-site`: the content requirements grow from a minimal example set to a concept-spine that documents the full public API surface (entity lifecycle, composition incl. nested scenes, physics, timing, extensibility, frame model, React player, export, fonts), with examples embedded inline in concept pages and all pages accurate to the current API.

## Impact

- **Docs app (`apps/docs`):** new/reorganized MDX under `content/docs/` (Core Concepts + Going Further sections); rewritten `meta.json` navigation; existing example `.mdx` pages folded into concept pages; accuracy edits to `text.mdx`, `export.mdx`, `composition.mdx`, `pacing.mdx`, `getting-started.mdx`, `index.mdx`.
- **Example scenes (`apps/docs/examples`):** a few new `*.scene.ts` for new APIs, registered in `registry.ts`; existing scenes unchanged (only their embedding page moves).
- **Spec:** `docs-site` requirements updated to describe the concept-spine content coverage.
- **No library code changes.** This is documentation only; the `<Example>` component and Player are used as-is.
- **Roadmap:** closes the "Docs that let a stranger self-serve" item in Now — the last committed pre-v0.1 bet.
