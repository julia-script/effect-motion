# Nested Scene Composition

## Why

Scene resolution and background currently live in `Runner.Settings` — playback configuration — so a scene value is not a self-contained composition: the same scene renders at whatever size the caller happens to pass, and `Scene.play` nests children into the movie's single resolution with no notion of the child's own bounds. Moving composition config onto the Scene makes scenes After Effects–style comps: self-describing, nestable at their own size, smaller or bigger than the final video.

## What Changes

- Scene values carry their own composition config: `width`, `height`, `backgroundColor`, passed as a second argument to `Scene.make` (defaults 1920×1080, transparent). Already started in the working tree.
- **BREAKING**: `Runner.Settings` loses `width`, `height`, `backgroundColor`. The runner inherits them from the root scene at `Scene.run` / `Scene.stream`. Settings keeps the playback-only knobs: `frameRate`, `seed`, `maxFrames`.
- Frame metadata (`width`/`height`/`backgroundColor` on every frame) comes from the root scene instead of settings.
- `Scene.play` mounts a child scene as a bounded sub-composition, AE precomp–style: the child gets an implicit mount group carrying the child's bounds, placed centered in the parent by default; child content is clipped to the child's bounds; a non-transparent child `backgroundColor` paints within those bounds (the transparent default reproduces AE's nested-comp behavior).
- The branch handle returned by `Scene.play` exposes the mount group, so parents position/scale/fade a whole nested scene with the existing animators (Group trait lenses) — multiple parallel smaller scenes are just multiple `play`s.

## Capabilities

### New Capabilities

- `scene-composition`: a scene value carries its composition config (width, height, backgroundColor) with AE-style defaults; the runner and frame metadata inherit the root scene's config.

### Modified Capabilities

- `frame-metadata`: "Runner settings define scene resolution" becomes "the root scene defines resolution/background"; `Runner.Settings` no longer accepts `width`/`height`/`backgroundColor`.
- `scene-play`: playing a scene mounts it as a bounded sub-composition — implicit sized mount group, centered default placement, bounds clipping, own background within bounds, group exposed on the handle for parent-side transforms.

## Impact

- `packages/motion/src/Scene.ts` — comp config on the scene (in progress), `play` mount group + handle.
- `packages/motion/src/Runner.ts` — Settings shrinks; root comp config resolved from the scene.
- `packages/motion/src/Renderer.ts` + `render/` — clipping to nested bounds, nested background paint.
- `packages/react` (`Player`, `usePlayer`) and `packages/cli` (studio, render command, `motion.config.ts`) — stop passing width/height/backgroundColor as settings; read them from the scene.
- `apps/docs` examples and package tests that pass `{ width, height }` to `Scene.run`.
- Out of scope (deferred): per-nested-scene cameras (AE gives each comp its own camera; ours stays runner-level, root-comp only), nested frame rates (one phaser, one movie rate).
