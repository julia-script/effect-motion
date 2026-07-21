# @effect-motion/export

## 0.5.0

### Minor Changes

- b7c330b: The CLI runs code entrypoints — `motion.config.ts` is gone.

  **BREAKING (pre-1.0 minor):** `defineConfig`, targets, config discovery, and every `motion render` flag are removed. Two files replace the config, each importing scenes as VALUES so typed resources check at authoring time:

  - `studio.ts` — `export default studioConfig({ scenes, layers })`: a record of scenes (keys are the picker's unique identifiers; values may carry per-entry player options, typed against the real `PlayerProps`) and ONE `layers` covering the union of every registered scene's resources — required iff any scene declares them, forbidden otherwise. `motion studio [file]` serves it (default `./studio.ts`); only registered scenes appear, and hot reload is plain Vite HMR over the entrypoint's import graph. Migrate: one import + one record entry per scene; `player` blocks become entry options.
  - `render.ts` — an ordinary program default-exporting a `Video.render(...)` effect (loader layers provided in the same pipe, compile-checked by `Video.render`'s own signature). `motion render [file]` executes it with the platform provided; the same file runs standalone via `tsx` by piping through `NodeServices`. Migrate: one `Video.render(scene, "<output>/<name>.mp4", { settings })` call per former target; former flags (fps/seed/dpr/frames/out-dir) are values in this code.

  Also: `Scene.make` takes an optional leading display name — `Scene.make("The Scene", gen, meta?)` — carried as `scene.name` (display-only; the studio labels entries `name ?? key`). `Resource.fetchBytes` memoizes per URL (failed fetches retry), so studio scene switches never refetch. `Video.render` creates the output path's parent directory. The scaffold ships `studio.ts` + `render.ts` instead of `motion.config.ts`.

- b7c330b: Typed resource loaders: fonts and images are scene requirements, not annotations.

  **BREAKING (pre-1.0 minor):** `Scene.annotate`/`annotateMerge`/`annotations` and the `Fonts`/`Images` annotation modules are removed. Assets are declared in the scene itself: `const Roboto = Font.Font("Roboto")` (or `Image.Image("logo")`), `yield*` the constant for the value entity props store — this puts `FontLoader<"Roboto">` into the scene's type, frames carry it as `Frame<Resources>`, and `Renderer.render` (and the Player) will not compile until a covering layer is provided. `Scene.run`/`stream` stay loader-free: frames are pure of resource bytes; only rendering consumes them.

  Provide bytes with `Font.layer(Roboto, loadEffect)` / `Image.layer(...)` — loads run once at layer construction (compose retries on the load effect; `Resource.fetchBytes(url)` is the common browser loader). The Player takes them via a new `renderLayers` prop, conditionally REQUIRED: `PlayerProps<S>` forbids it for loader-free scenes and demands `Layer<Scene.Resources<S>>` otherwise. Player failures (engine, loader loads) now render a visible error panel.

  More breaking changes: `Text.fontFamily` and `Shapes.Image.image` hold resource references (`{ _tag, id }`), never bare strings; the engine's implicit `DEFAULT_FONT_URL` auto-fetch is gone (`@effect-motion/thorvg` engine acquire loads nothing) — the built-in default font lives under the RESERVED id `"sans-serif"`, is the `fontFamily` schema default, and is auto-provided by the render path (provide your own loader under that id to override it). A resource referenced at render with no loader in context is a loud defect naming the id — the silent glyph fallback and image soft-skip are removed. `@effect-motion/thorvg`'s `Session` no longer takes `fonts`/`images` URL maps; pictures register lazily from loader bytes via `registerPicture` (decode-once per session). `Video.render` threads the scene's loaders to the caller (`Resource.ExtractLoaders`), so Node export paths can read font/image bytes straight from disk.

### Patch Changes

- Updated dependencies [b7c330b]
- Updated dependencies [b7c330b]
  - effect-motion@0.5.0
  - @effect-motion/thorvg@0.3.0

## 0.4.1

### Patch Changes

- Updated dependencies [3ee8e30]
  - effect-motion@0.4.1

## 0.4.0

### Minor Changes

- ceca2ef: Scenes are After Effects–style compositions, and `Scene.play` mounts bounded sub-comps.

  **BREAKING (pre-1.0 minor):** resolution and background moved from `Runner.Settings` onto the scene itself. `Scene.make(gen, { width, height, backgroundColor })` is the comp config (defaults 1920×1080, transparent — previously the runner defaulted 500×300, near-black); `Scene.run`/`Scene.stream` settings keep only playback fields (`frameRate`, `seed`, `maxFrames`). The runner, frame metadata, and default camera inherit the ROOT scene's config. Migrate by moving `{ width, height, backgroundColor }` from run/stream/config settings into `Scene.make`'s second argument — existing scenes that relied on the old dark default must now set their background explicitly.

  `Scene.play` mounts each child as a bounded sub-composition, AE-precomp-style: an implicit group carries the child's bounds (centered in the enclosing comp by default), content clips to them, a non-transparent child background paints within them, and the handle exposes the group (`handle.group`) so the parent moves/fades/scales the whole nested scene with the existing animators. `Scene.comp` reads the movie's comp config from inside a scene.

  Downstream: `motion.config.ts` target `settings` and the `motion render` flags drop `width`/`height`/`backgroundColor` (the scene's comp config decides); `@effect-motion/export`'s `VideoSceneSettings` likewise. `@effect-motion/thorvg` adds `Paint.clip` and renames `Canvas.draw`'s second parameter to `clear` (matching upstream `tvg_canvas_draw`), which the renderer now uses so transparent backgrounds don't show stale buffer pixels.

### Patch Changes

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

- a765873: New ThorVG renderer package: single ThorVG-backed rendering path with text/font support, three-tier lifetimes, effect-style modules, a font registry, and picture handling. Video export migrates to the ThorVG pipeline.

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
