# Design: Typed Resource Loaders

## Context

Today fonts and images ride on scene annotations (`scene.annotate(Fonts.Fonts, [...])`): untyped lists the runtime never reads, consumed only by the player (`Fonts.urlMap` → `Session.layer({ fonts })`) which has ThorVG fetch each URL at session acquire. Missing fonts fall back silently (`Tvg.Text.setFont(...).pipe(Effect.ignore)`), and the engine auto-fetches `DEFAULT_FONT_URL` when no fonts map is passed.

A WIP `Font.ts` already sketches the target: `Font.Font(id)` as a yieldable Effect introducing `FontLoader<ID>` into `R`, `ExtractFontLoader`/`ExcludeFontLoader` conditional types, and a `"~resources"` phantom field on `Scene`. This design finishes and generalizes that sketch.

The domain fact that shapes everything (already documented in `Fonts.ts`): the engine cannot measure text, so **resource bytes cannot affect frame data**. Frames are pure of resources; only rasterization consumes them.

## Goals / Non-Goals

**Goals:**

- Asset dependencies visible and checked in the type system, end-to-end: authoring → `Scene<E, R>` → `Frame<Resources>` → `Renderer.render` → player/exporter props.
- `Scene.run`/`Scene.stream` remain loader-free (tests and headless frame generation need no assets).
- No frame-time loading: bytes are fetched eagerly at layer construction; frame-time work is at most a per-session engine registration (memcpy).
- Zero-ceremony text keeps working (default font, string children).
- Loud, named failures replace silent fallbacks.

**Non-Goals:**

- Backward compatibility with the annotation model (deliberately removed, no shim).
- Airtight typing against hand-built resource values (accepted cooperative boundary; runtime defect is the backstop).
- Lazy/on-demand loading (preload-all-provided is the policy; over-provision is accepted).
- Predefined font providers (Google Fonts helpers etc.) — planned follow-up, out of scope here.
- SVG image sources — the loader shape leaves room, but only raster images are specified now.

## Decisions

### D1: Separate loader shapes, one shared brand

`FontLoader<ID>` and `ImageLoader<ID>` are distinct service interfaces (fonts will grow format/metrics metadata; images dimensions/colorspace; SVG would differ again). They share only a brand field, and `ExtractLoaders<R>` / `ExcludeLoaders<R>` are written once against that brand in a `Resource` module.

- *Alternative — one generic `Loader<Kind, ID>`*: rejected; over-abstracts before the per-kind metadata needs are known.
- *Alternative — fully independent types with per-kind Extract/Exclude pairs*: rejected; `Scene.ts` would accumulate parallel type machinery per resource kind.

### D2: Yieldable constants carrying their own tag (`RobotoFont.Loader`)

`Font.Font("Roboto")` returns one constant with two faces, mirroring how Effect's own `Context.Tag` is itself an Effect:

- **Author side**: `yield* RobotoFont` succeeds with the `Font<"Roboto">` value (`{ _tag, id }`) for entity props while declaring `FontLoader<"Roboto">` in `R`. The declaration is phantom — the effect must never dereference the tag, or the run-time exclusion (D3) becomes unsound.
- **Provider side**: `RobotoFont.Loader` is a `Context.GenericTag<FontLoader<"Roboto">>` whose key is derived from the id string (`effect-motion/Resources/FontLoader/Roboto`), plus a layer helper (`Font.layer(RobotoFont, loadEffect)`).

The string-derived tag key is the bridge over the literal-erasure gap: frame data stores only `{ id: string }`, and the renderer rebuilds the identical tag from that string at runtime. `EnsureLiteral` (types.ts) rejects non-literal ids at the `Font.Font` callsite so `FontLoader<string>` can never enter the accounting.

- *Alternative — separate `resourceContext(font)` helper*: works, but splits tag identity across two constants; `.Loader` welds it to the font.
- *Alternative — real (non-phantom) requirement, actually yielding the tag*: rejected; would force loaders onto `Scene.run`, contradicting the frames-are-pure-of-bytes semantics.

### D3: R-channel threading — accumulate at authoring, exclude at run, require at render

`Scene<E, R>` keeps the full `R`; `scene.runner` is typed `Effect<void, E, ExcludeLoaders<R> | Scope>` (the single erasure cast lives in `makeScene`); `Frame<Resources>` carries `ExtractLoaders<R>` as a phantom parameter; `Renderer.render<Resources>(frame)` returns an effect requiring `... | Resources`. Enforcement is type-level until render — render is the first runtime consumer, which is correct, not a compromise.

### D4: Eager service shape — the service IS the loaded resource

Loader services carry loaded data (`{ id, bytes, format? }` for fonts), not a `load: Effect` method. `Layer.effect(font.Loader, loadEffect)` runs the load once at runtime construction; retries/timeouts compose on the load effect at the provider seam (`loadEffect.pipe(Effect.retry(...))`) with no capability loss. By the time anything reads the service, bytes exist — the preload policy is enforced by construction, and the renderer resolves synchronously-shaped data.

- *Alternative — lazy `{ load }` method*: only earns its keep for on-demand loading, which is explicitly a non-goal.

### D5: Two-phase loading — load at layer build, register at render

**Load** (slow: network/fs) happens once at layer construction. **Register** (fast: memcpy into the engine/session) happens lazily at render, the first time a frame uses a resource, cached in a per-session registered set — fonts through the existing refcounted engine registry (`thorvg` `Font` module, byte-based `loadData`), images through session-scoped pictures. This dissolves the framerate concern without enumerating a layer's tags at session start (which would require poking Context internals).

### D6: Default font as ambient infrastructure

A built-in `Font.default` with reserved id `"sans-serif"`. `Text.fontFamily`'s constructor default is `Font.default`'s value — since no `yield*` occurs, `FontLoader<"sans-serif">` never enters `R`, and bare `Text` / string children keep working. The render path auto-merges the default font's layer *under* user layers, so providing a loader for the `"sans-serif"` id overrides the default — the old "merge over engine default" semantics reborn as ordinary layer precedence. The engine-level `DEFAULT_FONT_URL` auto-fetch is deleted; the default font is always loaded at render setup even if unused (accepted, same cost as today).

- *Alternative — no default, `fontFamily` required*: breaks string-children sugar at the schema level.
- *Alternative — ambient font context (`Scene.withFont`)*: more machinery than needed once the schema default + auto-provided layer exist.

### D7: Loud defects replace silent fallbacks

A frame referencing a resource whose loader is absent from context is a defect naming the resource id (repo determinism convention), replacing `setFont(...).pipe(Effect.ignore)`. The cooperative-typing hole (hand-built `{ _tag, id }` values bypassing `R`) is accepted; this defect is its backstop.

### D8: Player generics with conditionally-required `renderLayers`

`PlayerProps<S extends Scene.AnyScene>` with type-level accessors `Scene.AnyScene` / `Scene.Resources<S>` / `Scene.Error<S>` exported from the core package (exporters need the same bounds). When `Scene.Resources<S>` is `never`, `renderLayers` is forbidden (`renderLayers?: never`); otherwise required as `Layer<Scene.Resources<S>>`. The layer merges into the player's per-mount runtime stack, replacing the `Fonts.urlMap`/`Images.urlMap` session options. Load failures at runtime build surface as a visible player error state, not a console line.

## Risks / Trade-offs

- [Phantom R depends on discipline: any code path that actually yields a loader tag inside scene execution breaks the `ExcludeLoaders` cast] → the erasure lives in exactly one place (`makeScene`); a test asserts `Scene.run` succeeds with an empty context for a scene that declares fonts.
- [Cooperative typing: schema-decoded or hand-built resource values bypass `R`] → accepted (proposal); D7 defect names the offender at render.
- [Reserved `"sans-serif"` id collision] → documented as the override mechanism, a feature; docs must say so explicitly.
- [Conditional prop types (`renderLayers`) are fiddly with React generics/`exactOptionalPropertyTypes`] → keep the conditional in one exported `PlayerProps` type; verify both branches with type-level tests.
- [Eager preload loads unused fonts] → accepted by policy; bounded by what the user provides.
- [`Session.layer` consumers outside the player (exporters, demos) still pass URL maps] → migrate them in this change; the byte-based thorvg primitives (`Font.loadData`, picture load) stay as the single loading path.

## Migration Plan

Single change, no compatibility window (per proposal): land core `Resource`/`Font`/`Image` + Scene threading first (motion package compiles standalone), then renderer resolution, then thorvg default-font removal, then player/exporters/docs. Rollback is `git revert`; no data migrations.

## Open Questions

None — all decisions were settled in exploration with the author (loader separation, tag mechanics, default font, eager services, player typing, annotation removal).
