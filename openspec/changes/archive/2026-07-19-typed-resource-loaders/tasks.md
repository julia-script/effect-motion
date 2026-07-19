# Tasks: Typed Resource Loaders

## 1. Core resource module (packages/motion)

- [x] 1.1 Create the `Resource` module: shared loader brand, `ExtractLoaders<R>` / `ExcludeLoaders<R>` written once against the brand; type-level tests that they distribute correctly over mixed unions (`FontLoader | ImageLoader | Runner`)
- [x] 1.2 Reshape `Font.ts`: `Font.Font(id)` returns a yieldable constant (succeeds with `{ _tag, id }`, phantom `FontLoader<ID>` in R, never dereferences the tag) carrying `.Loader` (GenericTag, key `effect-motion/Resources/FontLoader/<id>`) — with `EnsureLiteral` rejecting non-literal ids; `FontLoader` service shape is eager loaded data `{ id, bytes, format? }`
- [x] 1.3 Add `Font.layer(font, loadEffect)` (Layer.effect — load runs once at layer build; retries compose on the caller's effect) and `Font.default` (reserved id `"sans-serif"`) with its built-in loader layer
- [x] 1.4 Create the `Image` module mirroring 1.2/1.3 (`Image.Image`, `.Loader`, `Image.layer`, `Image.schema`), keeping `ImageLoader` a separate shape under the shared brand

## 2. Scene threading and annotation removal

- [x] 2.1 Thread the R-channel through `Scene.ts` using `ExtractLoaders`/`ExcludeLoaders` (replace the WIP `ExtractFontLoader`/`ExcludeFontLoader`): `runner` typed `Effect<void, E, ExcludeLoaders<R> | Scope>` (single erasure cast in `makeScene`), `Frame<Resources>` phantom, `run`/`stream`/`step` requiring only `ExcludeLoaders<R>`
- [x] 2.2 Add exported type accessors `Scene.AnyScene`, `Scene.Resources<S>`, `Scene.Error<S>`
- [x] 2.3 Remove annotations: `annotate`/`annotateMerge`/`annotations` off the Scene value, delete `Fonts.ts` and `Images.ts`, update `index.ts` exports
- [x] 2.4 Test: a scene declaring a font runs (`Scene.run`) with an empty context and produces `Frame<FontLoader<...>>`; a type-level test that `render` on that frame does not compile without the layer

## 3. Entity schemas

- [x] 3.1 `shapes/Text.ts`: `fontFamily` becomes `Font.schema` with constructor default `Font.default`'s value; bare-string family rejected; string-children sugar and bare Text verified working via the default
- [x] 3.2 `shapes/Image.ts`: `image` becomes `Image.schema` reference; bare-string name rejected

## 4. thorvg changes

- [x] 4.1 `Engine.ts`: remove `DEFAULT_FONT_URL` and the `fonts ?? default` auto-load — bare engine acquire loads nothing and makes no network request
- [x] 4.2 Font registry: byte-source acquisition with caller-supplied source identity (refcount/dedup/tombstone/conflict semantics matching URL sources; magic-byte sniffing unchanged)
- [x] 4.3 Retire the motion-facing URL-map role of `Session.layer`'s `fonts`/`images` options (byte-based primitives remain the loading path)

## 5. Renderer resolution

- [x] 5.1 `Renderer.render<Resources>(frame)`: add `Resources` to the effect requirements; resolve loaders from context by rebuilding string-derived tags from frame-data ids
- [x] 5.2 Lazy per-session registration cache: fonts registered via the byte-source registry, images decoded into session pictures — once per resource per session, never per frame, never fetched at render time
- [x] 5.3 Missing loader → loud defect naming the resource id (delete the `setFont(...).pipe(Effect.ignore)` fallback and the image soft-skip)
- [x] 5.4 Auto-provide `Font.default`'s layer beneath caller context; test that a user layer under the `"sans-serif"` id overrides it
- [x] 5.5 Exporters (`PngExporter`, `CanvasExporter`) compile against the new `render` signature; a Node-side byte loader (fs read) exercised in a test

## 6. Player

- [x] 6.1 `PlayerProps<S extends Scene.AnyScene>` with conditionally-required `renderLayers` (forbidden when `Scene.Resources<S>` is `never`); type-level tests for both branches under `exactOptionalPropertyTypes`
- [x] 6.2 Merge `renderLayers` into the per-mount runtime stack; delete the `Fonts.urlMap`/`Images.urlMap` session options; readiness gates on runtime construction (eager loads included)
- [x] 6.3 Visible error state for loader/engine failures at runtime construction (rendered, not just `console.error`)

## 7. Docs and cleanup

- [x] 7.1 Rewrite `apps/docs/examples/custom-fonts.scene.ts` and `images.scene.ts` on the new API; document the reserved `"sans-serif"` id and its override behavior
- [x] 7.2 Clean scratch: `demo.ts` stray `Resource.js` import and commented WIP; full `pnpm lint` / `pnpm check` / `pnpm test` pass with no new failures
