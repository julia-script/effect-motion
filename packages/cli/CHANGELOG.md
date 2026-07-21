# @effect-motion/cli

## 0.5.0

### Minor Changes

- b7c330b: The CLI runs code entrypoints — `motion.config.ts` is gone.

  **BREAKING (pre-1.0 minor):** `defineConfig`, targets, config discovery, and every `motion render` flag are removed. Two files replace the config, each importing scenes as VALUES so typed resources check at authoring time:

  - `studio.ts` — `export default studioConfig({ scenes, layers })`: a record of scenes (keys are the picker's unique identifiers; values may carry per-entry player options, typed against the real `PlayerProps`) and ONE `layers` covering the union of every registered scene's resources — required iff any scene declares them, forbidden otherwise. `motion studio [file]` serves it (default `./studio.ts`); only registered scenes appear, and hot reload is plain Vite HMR over the entrypoint's import graph. Migrate: one import + one record entry per scene; `player` blocks become entry options.
  - `render.ts` — an ordinary program default-exporting a `Video.render(...)` effect (loader layers provided in the same pipe, compile-checked by `Video.render`'s own signature). `motion render [file]` executes it with the platform provided; the same file runs standalone via `tsx` by piping through `NodeServices`. Migrate: one `Video.render(scene, "<output>/<name>.mp4", { settings })` call per former target; former flags (fps/seed/dpr/frames/out-dir) are values in this code.

  Also: `Scene.make` takes an optional leading display name — `Scene.make("The Scene", gen, meta?)` — carried as `scene.name` (display-only; the studio labels entries `name ?? key`). `Resource.fetchBytes` memoizes per URL (failed fetches retry), so studio scene switches never refetch. `Video.render` creates the output path's parent directory. The scaffold ships `studio.ts` + `render.ts` instead of `motion.config.ts`.

### Patch Changes

- Updated dependencies [b7c330b]
- Updated dependencies [b7c330b]
  - effect-motion@0.5.0
  - @effect-motion/export@0.5.0

## 0.4.1

### Patch Changes

- Updated dependencies [3ee8e30]
  - effect-motion@0.4.1
  - @effect-motion/export@0.4.1

## 0.4.0

### Minor Changes

- 10e5d1b: Scaffolding moves to the new `create-effect-motion` package: run `pnpm create effect-motion` (or the npm/yarn/bun equivalent) instead of `motion init`.

  **BREAKING** (`@effect-motion/cli`): the `motion init` command is removed. The scaffold behavior is unchanged — same prompts, generated tree, and exact dependency pins — plus two additions: an optional Biome setup (`--biome`/`--no-biome`, prompt defaults to yes) and a `--yes` flag for fully non-interactive runs. `create-effect-motion` releases in lockstep with the other packages, so its scaffolds always pin the current versions.

- ceca2ef: Scenes are After Effects–style compositions, and `Scene.play` mounts bounded sub-comps.

  **BREAKING (pre-1.0 minor):** resolution and background moved from `Runner.Settings` onto the scene itself. `Scene.make(gen, { width, height, backgroundColor })` is the comp config (defaults 1920×1080, transparent — previously the runner defaulted 500×300, near-black); `Scene.run`/`Scene.stream` settings keep only playback fields (`frameRate`, `seed`, `maxFrames`). The runner, frame metadata, and default camera inherit the ROOT scene's config. Migrate by moving `{ width, height, backgroundColor }` from run/stream/config settings into `Scene.make`'s second argument — existing scenes that relied on the old dark default must now set their background explicitly.

  `Scene.play` mounts each child as a bounded sub-composition, AE-precomp-style: an implicit group carries the child's bounds (centered in the enclosing comp by default), content clips to them, a non-transparent child background paints within them, and the handle exposes the group (`handle.group`) so the parent moves/fades/scales the whole nested scene with the existing animators. `Scene.comp` reads the movie's comp config from inside a scene.

  Downstream: `motion.config.ts` target `settings` and the `motion render` flags drop `width`/`height`/`backgroundColor` (the scene's comp config decides); `@effect-motion/export`'s `VideoSceneSettings` likewise. `@effect-motion/thorvg` adds `Paint.clip` and renames `Canvas.draw`'s second parameter to `clear` (matching upstream `tvg_canvas_draw`), which the renderer now uses so transparent backgrounds don't show stale buffer pixels.

### Patch Changes

- 9e5dea5: Two `motion` CLI fixes:

  - Scaffold pins are now derived from the CLI's own package.json (all `@effect-motion/*` packages release in lockstep) instead of a hardcoded list that had gone stale — `motion init` no longer scaffolds outdated versions.
  - `motion studio` sets `esbuild: { jsx: "automatic" }` in its vite config. Scaffolded projects set no `jsx` in tsconfig, so esbuild fell back to the classic transform and the studio crashed before mount ("React is not defined") — rendering a blank page.

- f69e00a: `motion.config.ts` targets accept a `player` block — studio-only preview options mirroring `PlayerProps` (`autoPlay`, `defaultRepeatMode`, `isInfinite`, `prebufferedFrames`, `bufferCapacity`, `fps`) passed to the studio's Player, overriding its defaults. `player.fps` is a preview-only rate that wins over `settings.frameRate` in the studio (e.g. preview a heavy 60fps target at 30 — the scene runs at that rate, so previewed frames are not the export's frames). `motion render` ignores the whole block.
- Updated dependencies [ceca2ef]
  - effect-motion@0.4.0
  - @effect-motion/export@0.4.0

## 0.3.2

### Patch Changes

- 18a1ac6: Add `@effect-motion/cli` to the fixed release group so it versions in lockstep with `effect-motion`, and pick up the fixed `effect-motion` build (runtime `@effect-motion/thorvg` dependency).
  - effect-motion@0.3.2
  - @effect-motion/export@0.3.2

## 0.2.0

### Minor Changes

- a765873: New @effect-motion/cli package with `init`, `studio`, and `render` commands, built on effect/unstable/cli.

### Patch Changes

- Updated dependencies [a765873]
- Updated dependencies [a765873]
- Updated dependencies [a765873]
- Updated dependencies [a765873]
  - effect-motion@0.3.0
  - @effect-motion/export@0.3.0
