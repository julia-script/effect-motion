# @effect-motion/react

## 0.4.1

### Patch Changes

- Updated dependencies [3ee8e30]
  - effect-motion@0.4.1

## 0.4.0

### Patch Changes

- ceca2ef: Scenes are After Effects–style compositions, and `Scene.play` mounts bounded sub-comps.

  **BREAKING (pre-1.0 minor):** resolution and background moved from `Runner.Settings` onto the scene itself. `Scene.make(gen, { width, height, backgroundColor })` is the comp config (defaults 1920×1080, transparent — previously the runner defaulted 500×300, near-black); `Scene.run`/`Scene.stream` settings keep only playback fields (`frameRate`, `seed`, `maxFrames`). The runner, frame metadata, and default camera inherit the ROOT scene's config. Migrate by moving `{ width, height, backgroundColor }` from run/stream/config settings into `Scene.make`'s second argument — existing scenes that relied on the old dark default must now set their background explicitly.

  `Scene.play` mounts each child as a bounded sub-composition, AE-precomp-style: an implicit group carries the child's bounds (centered in the enclosing comp by default), content clips to them, a non-transparent child background paints within them, and the handle exposes the group (`handle.group`) so the parent moves/fades/scales the whole nested scene with the existing animators. `Scene.comp` reads the movie's comp config from inside a scene.

  Downstream: `motion.config.ts` target `settings` and the `motion render` flags drop `width`/`height`/`backgroundColor` (the scene's comp config decides); `@effect-motion/export`'s `VideoSceneSettings` likewise. `@effect-motion/thorvg` adds `Paint.clip` and renames `Canvas.draw`'s second parameter to `clear` (matching upstream `tvg_canvas_draw`), which the renderer now uses so transparent backgrounds don't show stale buffer pixels.

- Updated dependencies [ceca2ef]
  - effect-motion@0.4.0
  - @effect-motion/thorvg@0.2.0

## 0.3.2

### Patch Changes

- effect-motion@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [aabeb60]
  - effect-motion@0.3.1

## 0.3.0

### Minor Changes

- a765873: New Player component (with progress bar, fps display, options, and canvas/png exporters) replaces the legacy player and hook. Teardown is now unmount-safe — no unhandled rejections on navigation and no strict-mode teardown noise.

### Patch Changes

- a765873: Emit Node-ESM-compatible relative imports (`.js` specifiers) in built output.
- Updated dependencies [a765873]
- Updated dependencies [a765873]
- Updated dependencies [a765873]
- Updated dependencies [a765873]
  - effect-motion@0.3.0
  - @effect-motion/thorvg@0.1.0

## 0.2.0

### Minor Changes

- 75c9e81: Initial public release.

### Patch Changes

- Updated dependencies [75c9e81]
  - effect-motion@0.2.0
