# effect-motion

## 0.4.0

### Minor Changes

- ceca2ef: Scenes are After Effects–style compositions, and `Scene.play` mounts bounded sub-comps.

  **BREAKING (pre-1.0 minor):** resolution and background moved from `Runner.Settings` onto the scene itself. `Scene.make(gen, { width, height, backgroundColor })` is the comp config (defaults 1920×1080, transparent — previously the runner defaulted 500×300, near-black); `Scene.run`/`Scene.stream` settings keep only playback fields (`frameRate`, `seed`, `maxFrames`). The runner, frame metadata, and default camera inherit the ROOT scene's config. Migrate by moving `{ width, height, backgroundColor }` from run/stream/config settings into `Scene.make`'s second argument — existing scenes that relied on the old dark default must now set their background explicitly.

  `Scene.play` mounts each child as a bounded sub-composition, AE-precomp-style: an implicit group carries the child's bounds (centered in the enclosing comp by default), content clips to them, a non-transparent child background paints within them, and the handle exposes the group (`handle.group`) so the parent moves/fades/scales the whole nested scene with the existing animators. `Scene.comp` reads the movie's comp config from inside a scene.

  Downstream: `motion.config.ts` target `settings` and the `motion render` flags drop `width`/`height`/`backgroundColor` (the scene's comp config decides); `@effect-motion/export`'s `VideoSceneSettings` likewise. `@effect-motion/thorvg` adds `Paint.clip` and renames `Canvas.draw`'s second parameter to `clear` (matching upstream `tvg_canvas_draw`), which the renderer now uses so transparent backgrounds don't show stale buffer pixels.

### Patch Changes

- Updated dependencies [ceca2ef]
  - @effect-motion/thorvg@0.2.0

## 0.3.2

## 0.3.1

### Patch Changes

- aabeb60: Declare `@effect-motion/thorvg` as a runtime dependency. `Renderer.js` imports it at runtime, but it was listed under devDependencies, so the published package failed with `ERR_MODULE_NOT_FOUND` for any consumer outside the workspace (e.g. `pnpm dlx @effect-motion/cli`).

## 0.3.0

### Minor Changes

- a765873: 2.5D/3D camera system: z-axis on entities with depth-sorted rendering, a free 3D camera with AE-style defaults (50mm focal equivalent) and near-plane clipping, depth of field (focusDistance/aperture with blur-bucketed rendering), a screen-space HUD layer via the identity camera, and a two-node camera with point of interest plus directing helpers.
- a765873: Shape and asset additions: image assets (Images annotation, Shapes.Image, session-held pictures), rounded corners on Rect (rx/ry), independent 3D depth per Line endpoint (z2), and Path 3D command geometry (M/L/Z with per-point z).

### Patch Changes

- a765873: Emit Node-ESM-compatible relative imports (`.js` specifiers) in built output.

## 0.2.0

### Minor Changes

- 75c9e81: Initial public release.
