# Design — Nested Scene Composition

## Context

Today `Runner.Settings` owns `width`/`height`/`backgroundColor` (defaults 500×300, dark) alongside playback knobs (`frameRate`, `seed`, `maxFrames`). Frames are self-describing via `FrameMeta` copied from those settings, and the runner uses width to seed the default camera (`Camera.identity(width)`, AE 50mm-equivalent focal). `Scene.play` already nests scene bodies as branches (shared runner/phaser, fresh scope/seed, optional `parent` mount group), but a nested scene has no bounds of its own — it draws straight into the movie's coordinate space.

The working tree already moves comp config onto the Scene value: `Scene.make(gen, meta?)` with `width`/`height`/`backgroundColor` on the `Scene` interface (defaults 1920×1080, `Color.transparent`).

## Goals / Non-Goals

**Goals:**
- A scene value is a self-contained composition (AE comp): size + background travel with the scene.
- The runner inherits the ROOT scene's comp config; `Runner.Settings` becomes playback-only.
- `Scene.play` mounts a child as a bounded sub-composition: own bounds, clipped, positionable/scalable/fadeable as one unit, smaller or bigger than the root.
- Determinism invariants untouched (nested-equals-standalone seeding, frame-exact landings).

**Non-Goals:**
- Per-nested-scene cameras (camera stays runner-level, root comp only — AE gives each comp a camera; deferred).
- Per-nested-scene frame rates or frame caps (one phaser, one movie clock).
- Collapse-transformations / no-clip mode (AE's toggle); clipping is unconditional for now.
- Time-remapping of nested scenes.

## Decisions

1. **Comp config lives on the Scene value, not in annotations.** The runtime reads it, and scene-metadata's contract is that annotations are never read by the runtime. Passed as `Scene.make(gen, { width, height, backgroundColor })`; `makeScene` threads it through `annotate`/`annotateMerge` so annotated copies share it. (Already in the working tree.)

2. **Hard split: composition config vs playback settings — no overlap.** `Runner.Settings` drops `width`/`height`/`backgroundColor`; `Scene.run`/`Scene.stream` resolve them from the root scene and pass them to `Runner.make` alongside the remaining settings. Alternative considered: keep settings-level overrides for backward compatibility — rejected; two sources of truth for one number, and AE doesn't resize comps at render time either. Callers that want a different output size make a wrapper scene that plays the original.

3. **Defaults become 1920×1080 / transparent** (was 500×300 / dark). AE-familiar Full-HD default; transparent background means "nothing painted", matching AE's alpha-render behavior. The old dark default was a runner-preview convenience; previews that want a backdrop set one on the scene or in the studio chrome.

4. **`Scene.play` creates an implicit sized mount group.** Each `play` evaluation instantiates a Group carrying the child's `width`/`height` as its bounds, mounted under the ambient parent (or `options.parent`), and sets it as the child's ambient current-parent. Default placement: child comp CENTER at parent comp center (AE layer default), i.e. a translate of `((parent.width - child.width) / 2, (parent.height - child.height) / 2)` on the group. The handle gains `group`, so the parent drives the whole child with existing primitives — `moveTo`/`fadeTo` via the Group's trait lenses, scale via the Group's transform operations. No new animators.

5. **Bounds clip; child background paints within bounds.** The render layer clips a scene-mount group's subtree to its bounds rect and, when the child's `backgroundColor` is non-transparent, paints it as a backing rect within those bounds before the subtree. The transparent default therefore reproduces AE's nested-comp behavior (no visible bg) for free; setting a color opts into a visible card. Root background continues to ride `FrameMeta.backgroundColor` and is painted by the sink as today.

6. **`FrameMeta` sourced from the root scene.** No shape change — same `width`/`height`/`backgroundColor` fields, now taken from the root scene's comp config. Camera default stays `Camera.identity(rootWidth)`.

7. **Deep nesting composes structurally.** A `play` inside a played scene mounts its group under the inner scene's ambient parent (the inner mount group), so transforms and clips nest naturally — no special casing.

## Risks / Trade-offs

- [Breaking API: `Settings` shrinks, defaults change] → Single mechanical migration: move `{ width, height, backgroundColor }` from `Scene.run(...)`/config into `Scene.make`'s meta. CLI `motion.config.ts`, react `Player`, docs examples, and tests updated in this change; changeset marks the break.
- [Clipping in the ThorVG paint path is new machinery] → Bounds clip is a rect clip on the group's subtree — the simplest clip shape; implement once in `render/paint.ts` where group transforms already apply.
- [Nested scene wider than root gets the root camera's focal default] → Accepted: one camera per movie is the documented model; camera focal derives from ROOT width. Revisit with per-comp cameras.
- [Existing scenes rendered smaller than before (500×300 → 1920×1080 default)] → Loud in previews, not silent corruption; noted in migration.

## Open Questions

- None blocking. Per-comp cameras and a no-clip (collapse) option are follow-up changes if needed.
