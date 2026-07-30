# Rewrite the docs site: structure, prose, and examples

## Why

The docs are the last committed item before v0.1 ("Docs that let a stranger self-serve", roadmap Now), and the current site no longer serves that: the prose predates the center-origin/y-up coordinate change and the trait-system deletion, two concept pages and six example scenes document the particle system that is slated for a rewrite (and whose legacy shim in core exists *only* to keep those examples alive), and the example set is a repetitive pile of circle-moves at a nonstandard 500×300 resolution. Patching page by page would preserve a structure that was never sequenced for learning; a ground-up rewrite is cheaper and honest.

## What Changes

- **Navigation restructure** — from `index / getting-started / cli / concepts / going-further / examples / api` to:
  - **Getting Started** — install → first scene → playback → export a frame.
  - **Learn** — a *sequenced* path, one primitive per page, each page ending with a small scene the reader has built: scenes → entities → animators → timing → physics → composition → camera → randomness & determinism.
  - **Guides** — task-named how-tos: export a video, React player, custom fonts, images, custom entities, CLI.
  - **Examples** — a curated gallery where every entry teaches a real idea (math-visualization ports in the spirit of Manim's gallery); rendered scene first, full source below.
  - **API** — generated reference, unchanged.
- **All prose rewritten from scratch** against the current API (center-origin y-up space, post-trait-system entity model, Effect-based scenes-are-Effects framing).
- **All example scenes rewritten at 1920×1080** (16:9, full HD) — no more per-example custom resolutions.
- **Example quality bar**: practical over impressive, subject over style. Learn-page scenes are purposeful but simple; Examples-gallery entries are small explainers where the subject (a sine curve, a Bézier construction, a vector field) carries the visual interest. The existing `bezier-3d` example is the model and survives.
- **Particle content removed**: the `concepts/particles` and `examples/particles` pages and all six particle-dependent scenes (`particles`, `particle-field`, `floating-field`, `floating-motes`, `snow`, `camera-parallax`) are deleted; `camera-parallax` is rewritten particle-free since it illustrates the camera, not particles.
- Old showcase examples (`moon-moth`, `the-box`, `effect-logo`) are dropped from the rewrite; a creative showcase gallery is an explicit non-goal until there are strong references (follow-up).
- The React-style end-of-page "challenge" pattern (needs a playground) is an explicit follow-up, not part of this change.
- **Follow-up unblocked, not included**: with the particle examples gone, `packages/motion/src/particles/legacy.ts` (and possibly the whole `particles/` module) loses its last consumer and can be deleted from core in a separate change.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `docs-site`: the concept-spine navigation requirement is replaced by the Getting Started / Learn / Guides / Examples / API structure with a *sequenced* Learn path; a full-HD (1920×1080) settings convention for embedded examples is added; an example quality-bar requirement (every gallery entry teaches a nameable idea) is added; particle documentation is removed from the coverage requirement; full-public-API coverage is restated against the current API surface.

## Impact

- `apps/docs/content/docs/**` (all handwritten MDX rewritten; `api/` generated content untouched by hand).
- `apps/docs/examples/*.scene.ts` and `examples/registry.ts` (full example roster replaced).
- `openspec/specs/docs-site/spec.md` via delta.
- No core package code changes in this change. It *unblocks* deleting `packages/motion/src/particles/legacy.ts` (tracked ponytail debt) as a follow-up change against the `particle-system` spec.
