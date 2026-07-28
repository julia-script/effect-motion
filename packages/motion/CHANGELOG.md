# effect-motion

## 0.5.0

### Minor Changes

- bdac91f: Scene space is now center-origin and y-up, and shapes anchor at their center.

  **BREAKING (pre-1.0 minor):** the authoring frame changes from y-down/top-left (the SVG convention) to **x right, y up, origin at the viewport center, +z toward the viewer** — a right-handed frame, like Manim and Motion Canvas. Every coordinate in every scene changes meaning:

  - `(0, 0)` is the middle of the frame; the visible extent at z=0 is x ∈ [−width/2, width/2], y ∈ [−height/2, height/2]. Migrate positions with `x' = x − width/2`, `y' = height/2 − y`.
  - Positive `rotation.z` now reads **counterclockwise** on screen; migrate visual rotations with `rotX' = −rotX`, `rotZ' = −rotZ` (`rotY` unchanged).
  - **Rect, Square, and Image are center-anchored**: `position` is the shape's center and rotation is about it (Circle/Ellipse already were; Text keeps its typographic `textAnchor`/`baseline` semantics; Line/Path are point-defined).
  - The camera's `x`/`y` are plain world coordinates (the resting camera sits at `(0, 0)`), and `Projection.project`/`toView`/`resolveCamera` lost their `origin` parameter — with a center origin it was always zero.
  - `Scene.play` mounts center in the enclosing comp at `(0, 0)` by construction; the composite plane is center-anchored like an Image.
  - Particles: positive `gravity` still pulls toward the bottom of the screen; launch `angle: 0` still means straight up, but positive angles are now counterclockwise; a fill field's region is centered on the field's position. The RNG draw sequence is unchanged, so seeded streams are stable.

  The renderer's scene→three mapping is now the identity (three is y-up/center-origin natively); y-flips survive only at genuinely y-down boundaries (font metrics, texture row order, pixel readback).

- b7c330b: The CLI runs code entrypoints — `motion.config.ts` is gone.

  **BREAKING (pre-1.0 minor):** `defineConfig`, targets, config discovery, and every `motion render` flag are removed. Two files replace the config, each importing scenes as VALUES so typed resources check at authoring time:

  - `studio.ts` — `export default studioConfig({ scenes, layers })`: a record of scenes (keys are the picker's unique identifiers; values may carry per-entry player options, typed against the real `PlayerProps`) and ONE `layers` covering the union of every registered scene's resources — required iff any scene declares them, forbidden otherwise. `motion studio [file]` serves it (default `./studio.ts`); only registered scenes appear, and hot reload is plain Vite HMR over the entrypoint's import graph. Migrate: one import + one record entry per scene; `player` blocks become entry options.
  - `render.ts` — an ordinary program default-exporting a `Video.render(...)` effect (loader layers provided in the same pipe, compile-checked by `Video.render`'s own signature). `motion render [file]` executes it with the platform provided; the same file runs standalone via `tsx` by piping through `NodeServices`. Migrate: one `Video.render(scene, "<output>/<name>.mp4", { settings })` call per former target; former flags (fps/seed/dpr/frames/out-dir) are values in this code.

  Also: `Scene.make` takes an optional leading display name — `Scene.make("The Scene", gen, meta?)` — carried as `scene.name` (display-only; the studio labels entries `name ?? key`). `Resource.fetchBytes` memoizes per URL (failed fetches retry), so studio scene switches never refetch. `Video.render` creates the output path's parent directory. The scaffold ships `studio.ts` + `render.ts` instead of `motion.config.ts`.

- 31d0718: The entity world is closed: a tagged union and a uniform transform replace open generics and traits.

  **BREAKING (pre-1.0 minor):** `Entity` is now a closed `Schema.TaggedUnion` over the ten known entities (`Line`, `Path`, `Rect`, `Circle`, `Ellipse`, `Text`, `Group`, `Hud`, `Image`, `Camera`); entity identity is `_tag`. The open-world machinery is removed: `Entity<Name, Data, Traits>`, `Entity.make`, `AnyEntity`, `EntityData`, `isEntity`, and the entire trait system (`TraitLens`, `EntityTraits`, `PartialTraits`, `TraitKey`, `traitOrDie`, `~position`, `~opacity`, `positionLens`/`opacityLens`, every per-entity lens). Semantic animators (`move`/`moveTo`, `fade`/`fadeTo`, `spring`/`springTo`) target schema fields directly and are compile-time gated by `_tag` narrowing — fading an entity without `opacity` is a type error naming the missing field.

  Every entity carries a uniform transform: `position: Vec3`, `rotation: Vec3`, `scale: Vec3`. Flat `x`/`y`/`z` fields and `Rect`'s `rotX`/`rotY`/`rotZ` are subsumed; `Line`'s `start`/`end` become `Vec3` offsets **relative to** its `position` (`x2`/`y2`/`z2` removed), so animating `position` translates any shape rigidly with no per-entity compensation. `Group`'s unused 2D affine DSL (`TransformMatrix`, `TransformOperation`, `identityTransform`, `multiplyTransforms`) is deleted; groups compose the same TRS transform as everything else.

  `Instance` no longer carries its entity: it is `{ id, kind }` with a phantom `Instance<Tag>` parameter, and `isInstanceOf` compares tags. Engine-owned visibility is a plain `visible: boolean` field (replacing `~visible`). At the renderer seam, frame data is the typed union itself — `FrameData.ts` and its casts are deleted; the renderer narrows on `_tag` through an exhaustive registry.

- 31d0718: The renderer is three.js/WebGPU; ThorVG is retired.

  **BREAKING (pre-1.0 minor):** `@effect-motion/thorvg` is deleted and no longer published. Two packages replace it: `@effect-motion/three`, a bindings-only Effect wrapper over three.js (browser entry plus a `/node` entry that installs Dawn-backed WebGPU and the environment shims three needs), and `@effect-motion/renderer`, the retained frame renderer — the only place frames meet three — with a browser canvas adapter and a headless Node PNG adapter, consumed by the player and export.

  Core goes renderer-free: `Renderer.ts`, `render/` (shapes, paint, CPU depth-of-field), and the render error channel are deleted from `effect-motion`; the frame stream (plus `Color` and camera resolution in `Projection.ts`) is core's renderer-facing contract, and no renderer dependency remains in its tree.

  Rendering semantics change with the backend: the entity render contract is retained `build`/`update`/`dispose` (replacing immediate-mode paint functions); strokes are perspective-correct world-unit widths; occlusion is the GPU z-buffer (deterministic `renderOrder` breaks coplanar ties) instead of painter's-order sorting; depth of field is per-pixel GPU post-processing, still bypassed at aperture 0; text renders as SDF glyphs (troika-three-text) with real `Font` resource resolution. The camera model is redefined in three-native terms, preserving the y-down/top-left scene space, the z=0 identity invariant, and the AE-style focal-length default.

  `@effect-motion/react`'s Player and `@effect-motion/export`'s pipeline are rewired to the new renderer (GPU render-target readback → PNG → ffmpeg; the player pre-warms the renderer to absorb the first-frame pipeline compile). Determinism is clarified as stopping at the frame stream: same seed + settings → same frames; pixel-identical rendered output across backends is explicitly not a goal.

- b7c330b: Typed resource loaders: fonts and images are scene requirements, not annotations.

  **BREAKING (pre-1.0 minor):** `Scene.annotate`/`annotateMerge`/`annotations` and the `Fonts`/`Images` annotation modules are removed. Assets are declared in the scene itself: `const Roboto = Font.Font("Roboto")` (or `Image.Image("logo")`), `yield*` the constant for the value entity props store — this puts `FontLoader<"Roboto">` into the scene's type, frames carry it as `Frame<Resources>`, and `Renderer.render` (and the Player) will not compile until a covering layer is provided. `Scene.run`/`stream` stay loader-free: frames are pure of resource bytes; only rendering consumes them.

  Provide bytes with `Font.layer(Roboto, loadEffect)` / `Image.layer(...)` — loads run once at layer construction (compose retries on the load effect; `Resource.fetchBytes(url)` is the common browser loader). The Player takes them via a new `renderLayers` prop, conditionally REQUIRED: `PlayerProps<S>` forbids it for loader-free scenes and demands `Layer<Scene.Resources<S>>` otherwise. Player failures (engine, loader loads) now render a visible error panel.

  More breaking changes: `Text.fontFamily` and `Shapes.Image.image` hold resource references (`{ _tag, id }`), never bare strings; the engine's implicit `DEFAULT_FONT_URL` auto-fetch is gone (`@effect-motion/thorvg` engine acquire loads nothing) — the built-in default font lives under the RESERVED id `"sans-serif"`, is the `fontFamily` schema default, and is auto-provided by the render path (provide your own loader under that id to override it). A resource referenced at render with no loader in context is a loud defect naming the id — the silent glyph fallback and image soft-skip are removed. `@effect-motion/thorvg`'s `Session` no longer takes `fonts`/`images` URL maps; pictures register lazily from loader bytes via `registerPicture` (decode-once per session). `Video.render` threads the scene's loaders to the caller (`Resource.ExtractLoaders`), so Node export paths can read font/image bytes straight from disk.

### Patch Changes

- 31d0718: A scene whose body is only `Scene.background(...)` no longer deadlocks. A startup race let the scene's end-check run before the background branch registered, leaving playback blocked forever with zero frames and no error. The end path now races against the scene fiber and re-enters when it wins. Behavior note: a background-only scene now ends immediately with **0 frames** — a background is not content and does not hold a scene open; pair it with something that defines the scene's length.
- 31d0718: `Motion.wait` works as the opening step of a pipe chain. `instance.pipe(Motion.wait(...), ...)` hung the scene with zero frames: the chain's first step receives the bare `Instance` handle, which is Pipeable but not an Effect, so the internal tap silently never resolved its phaser party. `wait` now lifts the handle through the same normalization every other animator uses, and its return type is conditional on the chain position. The earlier guidance to "place `wait` after at least one animator" is obsolete.

## 0.4.1

### Patch Changes

- 3ee8e30: The camera is one module again: the `lookAt`/`follow`/`orbit`/`orbitTo`/`dolly`/`dollyTo` helpers and `CameraTarget` moved from the internal `CameraHelpers.ts` into `Camera.ts`, and `CameraHelpers.ts` is deleted. The public `Camera.*` namespace is unchanged — it re-exported all of these already. `Instance` gains the `AnyInstance` convenience alias used by the helper signatures.

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
