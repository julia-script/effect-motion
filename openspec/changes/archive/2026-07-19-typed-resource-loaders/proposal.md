# Typed Resource Loaders

## Why

Font and image dependencies are currently untyped side-channel annotations (`scene.annotate(Fonts.Fonts, [...])`) that the runtime never checks: a scene can reference a font or image that was never declared, and the failure is a silent glyph/picture fallback at render time. Typing resources into the Scene's `R` channel makes asset dependencies checkable end-to-end — a scene that uses `Font.Font("Roboto")` produces `Scene<E, FontLoader<"Roboto"> | Runner>`, its frames carry `Frame<FontLoader<"Roboto">>`, and `Renderer.render` will not compile until a loader layer for exactly that font is provided.

## What Changes

- **New `Resource` foundation**: a shared loader brand with `ExtractLoaders<R>` / `ExcludeLoaders<R>` type utilities written once; `FontLoader<ID>` and `ImageLoader<ID>` stay separate service shapes (room for kind-specific metadata) unified only by the brand.
- **New authoring surface**: `Font.Font("Roboto")` / `Image.Image("logo")` return yieldable constants — `yield*` in a scene returns the resource value for entity props and adds the loader to the scene's `R` (phantom: scene *execution* never needs bytes). Each constant carries its Context tag as `.Loader` (key derived from the id string) plus a layer helper that eagerly loads at layer build (preload-all-provided policy).
- **Scene/Frame threading**: `Scene<E, R>` excludes loaders from the run requirement (`Scene.run`/`stream` stay loader-free — frames are pure of bytes) and re-surfaces them as `Frame<Resources>`; `Renderer.render(frame)` adds `Resources` to its `R` and resolves loaders from context by rebuilding the tag key from the id string in frame data.
- **Default font**: **BREAKING** — the engine's `DEFAULT_FONT_URL` auto-fetch fallback is removed. A built-in `Font.default` (reserved id `"sans-serif"`) becomes the `fontFamily` constructor default; the render path auto-provides its loader, overridable by layer precedence. String-children sugar and bare `Text` keep working with zero ceremony.
- **Entity schemas**: **BREAKING** — `Text.fontFamily` becomes a `Font` reference (schema-defaulted to `Font.default`); `Image.image` becomes an `Image` reference.
- **Renderer**: missing loader at render is a loud defect naming the resource (replaces today's `Effect.ignore` silent fallback). Engine/session registration happens lazily per resource (fast memcpy from preloaded bytes), cached per session.
- **Player**: **BREAKING** — `PlayerProps<S extends Scene.AnyScene>`; a `renderLayers` prop is conditionally required (forbidden when `Scene.Resources<S>` is `never`, required as `Layer<Resources>` otherwise). Load failures render a visible error state instead of a console line.
- **Removals**: **BREAKING** — `Scene.annotate` / `annotateMerge` / `annotations`, the `Fonts` and `Images` annotation modules (`Fonts.ts`, `Images.ts`, `urlMap`), the player's annotation reads, and the `Session.layer` URL-based `fonts`/`images` options as the motion-side loading path.
- Docs examples (`custom-fonts.scene.ts`, `images.scene.ts`) rewritten to the new API.

## Capabilities

### New Capabilities

- `resource-loaders`: the typed resource system — resource values and yieldable constants (`Font.Font`, `Image.Image`), per-id loader tags with string-derived keys, the shared loader brand with `ExtractLoaders`/`ExcludeLoaders`, eager preload-at-layer-build semantics, the built-in default font, and the R-channel threading contract (author-time accumulation, run-time exclusion, render-time requirement).

### Modified Capabilities

- `font-loading`: annotation-based declaration replaced by typed loaders; player readiness/loading contract now hangs off layer construction instead of annotation reads.
- `image-assets`: same replacement for images; `Shapes.Image` references an `Image` resource value instead of a declared name string.
- `scene-metadata`: the annotations mechanism is removed entirely (requirement removal).
- `text-entity`: `fontFamily` becomes a `Font` reference defaulting to `Font.default`; plain-string families are no longer accepted.
- `react-player`: typed `PlayerProps` generic, conditionally-required `renderLayers`, visible load-error state, no annotation reads.
- `motion-renderer`: `render` takes `Frame<Resources>` and requires the loaders in `R`; resolves loaders from context; missing resource is a loud defect; lazy per-session registration from preloaded bytes.
- `thorvg-fonts`: engine acquire no longer auto-loads a default font by URL; the scoped registry accepts in-memory bytes with a caller-supplied source identity. (`thorvg-images` needs no requirement change — byte-based picture loading is already its contract; the session URL-map behavior being replaced is specced under `image-assets`.)

## Impact

- `packages/motion/src`: new `Resource`/`Font`/`Image` modules (current WIP `Font.ts` reshaped); `Scene.ts` (`~resources` phantom, `ExtractLoaders`/`ExcludeLoaders` threading, annotate removal); `Renderer.ts` (`R | Resources`, loader resolution, registration cache); `shapes/Text.ts`, `shapes/Image.ts` schemas; `Fonts.ts` / `Images.ts` deleted; `index.ts` exports.
- `packages/thorvg/src`: `Engine.ts` default-font fallback removal; `Session.ts` loses the motion-facing URL loading role (byte-based `Font.loadData` / picture registration remain the primitives).
- `packages/react/src/Player.tsx`: generic props, `renderLayers` wiring into the runtime stack, error state.
- `apps/docs/examples`: `custom-fonts.scene.ts`, `images.scene.ts` rewritten.
- Exporters (`PngExporter`, `CanvasExporter`) gain the same loader requirement through `render`'s `R` — the Node export path is where `path`-style byte loaders become real.
- No new dependencies. Known accepted boundary: the typing is cooperative (hand-built resource values bypass `R` accounting); the renderer defect is the runtime backstop.
