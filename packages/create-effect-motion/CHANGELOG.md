# create-effect-motion

## 0.5.0

### Minor Changes

- b7c330b: The CLI runs code entrypoints — `motion.config.ts` is gone.

  **BREAKING (pre-1.0 minor):** `defineConfig`, targets, config discovery, and every `motion render` flag are removed. Two files replace the config, each importing scenes as VALUES so typed resources check at authoring time:

  - `studio.ts` — `export default studioConfig({ scenes, layers })`: a record of scenes (keys are the picker's unique identifiers; values may carry per-entry player options, typed against the real `PlayerProps`) and ONE `layers` covering the union of every registered scene's resources — required iff any scene declares them, forbidden otherwise. `motion studio [file]` serves it (default `./studio.ts`); only registered scenes appear, and hot reload is plain Vite HMR over the entrypoint's import graph. Migrate: one import + one record entry per scene; `player` blocks become entry options.
  - `render.ts` — an ordinary program default-exporting a `Video.render(...)` effect (loader layers provided in the same pipe, compile-checked by `Video.render`'s own signature). `motion render [file]` executes it with the platform provided; the same file runs standalone via `tsx` by piping through `NodeServices`. Migrate: one `Video.render(scene, "<output>/<name>.mp4", { settings })` call per former target; former flags (fps/seed/dpr/frames/out-dir) are values in this code.

  Also: `Scene.make` takes an optional leading display name — `Scene.make("The Scene", gen, meta?)` — carried as `scene.name` (display-only; the studio labels entries `name ?? key`). `Resource.fetchBytes` memoizes per URL (failed fetches retry), so studio scene switches never refetch. `Video.render` creates the output path's parent directory. The scaffold ships `studio.ts` + `render.ts` instead of `motion.config.ts`.

## 0.4.1

## 0.4.0

### Minor Changes

- 10e5d1b: Scaffolding moves to the new `create-effect-motion` package: run `pnpm create effect-motion` (or the npm/yarn/bun equivalent) instead of `motion init`.

  **BREAKING** (`@effect-motion/cli`): the `motion init` command is removed. The scaffold behavior is unchanged — same prompts, generated tree, and exact dependency pins — plus two additions: an optional Biome setup (`--biome`/`--no-biome`, prompt defaults to yes) and a `--yes` flag for fully non-interactive runs. `create-effect-motion` releases in lockstep with the other packages, so its scaffolds always pin the current versions.
