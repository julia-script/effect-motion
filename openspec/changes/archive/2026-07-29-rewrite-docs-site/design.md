# Design: rewrite-docs-site

## Context

See proposal.md — Why. Constraints shaping the approach:

- The Fumadocs app, the `Example` embed component, the registry mechanism (key = displayed filename), and the generated `api/` tree all work and stay. This change is content + navigation, not infrastructure.
- The recent `center-origin-y-up` change (archived 2026-07-28) means positions are centered and y-up with center-anchored shapes; all prose and every scene coordinate must be authored against that model.
- Six existing example scenes import `Particles`; they are the sole consumers of `packages/motion/src/particles/legacy.ts` (see its `ponytail:` comment). This change deletes the scenes only; the core deletion is a follow-up change against `particle-system`.
- Structure research (Diátaxis; Manim, Effect, Vite, React, Motion Canvas docs): sequenced learning path with one primitive per page (Motion Canvas/Effect pattern), task-named guides, explanation embedded rather than siloed, gallery entries that show output before code (Manim pattern).

## Goals / Non-Goals

**Goals:**

- A stranger can go from install to an exported video by reading in sidebar order.
- Every embedded scene is 1920×1080 and worth looking at — the subject (math, geometry) carries the visuals.
- Zero references to particles, top-left origin, traits, or any pre-rewrite API in handwritten content.

**Non-Goals:**

- A creative showcase gallery (moon-moth-class pieces) — deferred until strong references exist.
- End-of-page interactive challenges (needs a playground) — deferred.
- Any change to core packages, the Player, the Example component, or docs infrastructure.
- Regenerating or hand-editing the `api/` reference tree.

## Decisions

### D1 — Getting-started-first, not gallery-first

Manim leads with its gallery; we lead with Getting Started. Rationale: the gallery's job (proof-of-quality) only works with genuinely impressive pieces, and this change's examples are deliberately practical rather than showpieces. The Examples section sits after Guides. Revisit ordering when a showcase gallery exists.

### D2 — Page inventory

```
index                     what effect-motion is; one strong embedded scene
getting-started           install → first scene → play it → export a frame
learn/
  01 scenes               Scene.make, run/stream, Settings, frames; scenes are Effects
  02 entities             instantiate, shapes, children/visible/append/remove, update/data
  03 animators            base/To pairs, dual forms, tween/move/fade, wait
  04 timing               durations, easings (easing race scene)
  05 physics              spring/springTo, presets; no durations
  06 composition          chain, all, stagger, fork, background, repeat, finish
  07 camera               dolly/orbit/lookAt/follow, 2.5D depth (DoF disabled — not documented)
  08 randomness           seeded Random, determinism invariants
guides/
  export-video            bundled ffmpeg, binary override
  react-player            Player in a React app
  custom-fonts            font loading + renderLayers
  images                  image assets + renderLayers
  custom-entities         userland builders; renderer `renderers` option (build/update/dispose); nested scenes (Scene.play)
  cli                     init/render/studio
examples/                 see D3
api/                      untouched
```

Nested scenes ride in `custom-entities` (both are "extend the vocabulary" topics); split later only if the page bloats.

### D3 — Example roster

Learn-page scenes (simple, concept-is-the-star): one per Learn page, written fresh; `easing-race` is the model and is rebuilt at full HD for the timing page.

Examples gallery (ports of Manim-style math visualizations, each a small explainer):

| entry | idea | primitives exercised |
|---|---|---|
| sine-from-circle | dot orbits unit circle, tracer draws the sine wave | circle, line, growing path |
| function-plot | sin/cos drawn onto axes with labels | sampled-path flattening, text, stagger |
| riemann-rects | rectangles under a curve appear in sequence | rects, stagger |
| grid-warp | line grid deforms through a nonlinear function | paths, tween |
| bezier-3d | kept — the incumbent that set the bar | paths, lines, camera orbit |
| depth-orbit | camera orbits flat shapes layered in z | the 2.5D premise, parallax |
| min-seeker | dot springs to a parabola's minimum | springs as meaning |
| text-write-on | per-glyph write-on and crossfade | SDF text, stagger |
| streamlines | short lines advected by a vector field | seeded Random, determinism |
| camera-follow-graph | camera rides a dot along a curve | follow, dolly |

Ten entries; each page names its idea in the first sentence. Scenes that only demonstrate API mechanics live on Learn pages, never in the gallery.

### D4 — Full HD convention

Every scene declares `{ width: 1920, height: 1080 }` inline in its settings — no shared preset module. Two literals per file beat an import that hides what the docs are teaching (settings are themselves documented API surface). Backgrounds stay per-scene choices.

### D5 — Delete-then-rewrite, not migrate

All handwritten MDX and all `*.scene.ts` files are deleted and rewritten rather than edited. The old prose predates two breaking refactors; auditing every sentence costs more than rewriting from the (now stable) API. Git history preserves the old content.

### D6 — Particle removal sequencing

This change removes the six particle scenes and both particle pages. The core cleanup (`particles/legacy.ts`, possibly `particles/` entirely, plus the `Particles` export) is a separate follow-up change against the `particle-system` spec — it is a breaking core change with its own review surface, and bundling it here would couple a content change to a package major-surface decision.

## Risks / Trade-offs

- [Full-HD scenes are heavier to render in-browser than 500×300] → the Player already renders at canvas size, not declared size; verify playback stays smooth on the docs pages during implementation, and treat any regression as a Player concern, not a docs blocker.
- [Ten gallery scenes at explainer quality is real authoring effort] → gallery can ship at five strong entries and grow; Learn/Guides completeness is the v0.1 gate, per the roadmap's "stranger can self-serve".
- [Rewriting all prose risks losing hard-won accurate fragments] → the delta spec's accuracy scenarios (coordinate space, text, export) encode the known truths; AGENTS.md remains the API-conventions source while writing.
- [Docs and `api/` reference drift in tone since only one is rewritten] → acceptable; the generated tree is uniform by construction.

## Open Questions

- Which single scene fronts the index page (candidates: depth-orbit or sine-from-circle) — pick during implementation once both exist.
