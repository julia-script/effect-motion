## Context

The docs app (`apps/docs`, Next.js + Fumadocs) has 14 live example scenes, all embedded via the drift-proof `<Example name>` component (reads the executed `examples/<name>.scene.ts` at build time and renders both the played scene and its source). Content today is example-first: a flat `Examples` section plus a few concept pages (`composition`, `pacing`, `getting-started`, `export`) and two showcase scenes (`moon-moth`, `the-box`).

The gap is conceptual coverage, not example count. Zero-doc APIs: the entity/instance lifecycle from the `refactor-text-and-children` change (`children`, `$visible`, `appendChild`/`removeChild`, `update`/`data`), nested scenes (`Scene.play`, `finish`), extensibility (`Entity.make` custom render, the SVG sinks), the frame model (`run`/`stream`/`step`, `Settings`), and the React player (`usePlayer`/`Player`). Some existing pages also predate the refactor and risk describing the old API.

The library API is small enough that *complete* documentation is achievable, which is the bar for a quiet v0.1: a stranger self-serves.

## Goals / Non-Goals

**Goals:**

- A concept-spine structure (Core Concepts → Going Further) where every public symbol has a documented home.
- Complete coverage of the public API, with live examples embedded inline in the relevant concept page.
- Accuracy: every page reflects the post-refactor API (plain-string `Text`, children-defined structure, bundled ffmpeg).
- Reuse the existing `<Example>` machinery; moving an example between pages is a one-line change, no scene/registry churn.

**Non-Goals:**

- A generated API reference (per-symbol signatures/params). Deferred to a later TSDoc-cleanup + generation change.
- Marketing/showcase polish — art-directed hero animations. Explicitly deprioritized for the quiet release; the existing showcase scenes stay as a gallery.
- Any library code change. Docs-only; `<Example>` and the Player are used as-is.
- The scratchpad route and no-drift guarantee — unchanged, out of scope.

## Decisions

### D1 — Concept spine over flat gallery

```
  Introduction ............. mental model (deterministic frame-exact scenes;
                             pure fn of (scene, settings) → frames; what it's NOT)
  Getting started .......... install, minimal scene, see it run

  ── CORE CONCEPTS ──
  Scenes & the frame model   Scene.make; run→frames, stream→lazy, step; Settings
  Entities & instances       shapes; instantiate; children; $visible;
                             appendChild/removeChild; update/data
  Animators                  base/To pairs, dual forms; tween/move/fade; wait;
                             raw vs semantic layer
  Physics                    spring/springTo, presets, no-duration
  Timing & easing            the curve library (named/factory/custom fn)
  Composition                chain/all/stagger/fork/background/repeat; play; finish
  Determinism                seed, frame-exactness, invariants

  ── GOING FURTHER ──
  Custom entities            Entity.make + render function + trait lenses
  Rendering & sinks          SvgRenderer (string) vs SvgDomRenderer (live)
  React Player               usePlayer / Player — live consumption
  Export to video            resvg → ffmpeg (bundled binary); pairs with Player
  Fonts                      the Fonts annotation, both paths

  Examples gallery ......... moon-moth, the-box (showcase, kept as-is)
  Patterns ................. "how do I…" recipes (fast-follow if time-limited)
```

- **Why**: a newcomer learns from a spine (model → first scene → concepts in dependency order), not a bag of examples. It also forces every public symbol to have exactly one home, which is how we guarantee completeness.
- **Alternatives considered**: keep the gallery, add concept pages alongside (rejected — two parallel structures the reader must reconcile); minimal hole-filling only (rejected — leaves the docs organizationally flat, doesn't meet "well-documented").

### D2 — Examples embed inline via the existing `<Example>` component

The 14 scenes relocate from the flat gallery into the concept page they illustrate; `<Example name="springs" />` goes on the Physics page, `chain`/`stagger`/`fork-background` on Composition, etc. A page may hold several.

- **Why it's cheap and safe**: `<Example>` needs only a `name` and reads from `examples/*.scene.ts` at build time (the same file the registry runs), so moving an example is a one-line cut-paste in MDX — no scene files move, no registry change, and the no-drift guarantee is preserved. Verified by reading `components/example.tsx`.
- **Consequence**: the `content/docs/examples/*.mdx` gallery pages are largely dissolved into concept pages; the showcase scenes keep a small gallery.

### D3 — Frame model in the Scenes page; Player as a short Going-Further page

The frame model (`run`/`stream`/`step`) is foundational, so it lives in the Scenes concept page, not a separate advanced topic. The React player gets a short dedicated page under Going Further, framed alongside Export as the two ways to *consume* frames (live/browser vs file).

- **Why**: closes the "I made a scene, how do I see it in my app?" hole. The embedded `<Example>` already shows the Player working, but nothing tells the reader that's `usePlayer` and how to use it themselves.

### D4 — A few new scenes only for genuinely new APIs

New small scenes: a `children`-composition demo, an `appendChild` reparent demo, and a custom-entity demo. Everything else the existing 14 already cover.

- **Why**: the new refactor APIs have no illustrating scene yet; the rest do. Keep new scene count minimal.

### D5 — Accuracy pass is a first-class task, not incidental

Every pre-refactor page (`text`, `export`, `composition`, `pacing`, `getting-started`, `index`, the showcase scenes) is audited against the current API. Known corrections: plain-string `Text` (no rich-text tree / `strong` / `emphasis` / `Motion.reveal`), children-defined structure (no `parent` arg), bundled ffmpeg in export.

- **Why**: stale docs are worse than missing docs for a self-serve reader — they mislead. The refactor and ffmpeg change both landed after these pages were written.

## Risks / Trade-offs

- **Scope creep into a rewrite** → mitigated by D2 (relocation, not rewriting, for the 14 existing scenes) and by making Patterns a fast-follow. The bulk of new *writing* is the ~6 undocumented concept pages.
- **Concept pages drift from the API over time** → embedded `<Example>`s stay honest (executed source), but prose can rot. Accepted for now; the deferred generated-API-reference pass is the longer-term fix.
- **Nav reshuffle breaks existing deep links** → pre-v0.1, no external audience yet, so link breakage is low-cost. Redirects not needed.
- **"Complete coverage" is a moving target** → the spec pins a concrete symbol list (see the Full public-API coverage requirement); completeness is checked against that list, not a vibe.
- **Patterns page underspecified** → deliberately kept as optional/fast-follow so it can't block the publish-gating pages.
