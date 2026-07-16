# ThorVG Text & Fonts

## Why

`Shapes.Text` exists and its fields (`text`, `fontSize`, `fontFamily`, `textAnchor`, `baseline`) are complete, but the single ThorVG renderer cannot draw it: `builtinPaints` omits Text, and `@effect-motion/thorvg`'s `api.ts` wraps only `_tvg_text_new` — not `set_text`/`set_font`/`set_size`/`set_color`/`align`, and not `_tvg_font_load_data`. ThorVG also ships **no default font** in the wasm, so text renders nothing until a font is loaded into the engine by data. This is the last built-in the ThorVG renderer can't paint, and it blocks the docs examples (Text is used in 8 of them).

The prior `font-loading` spec described the browser player loading `FontFace` into `document.fonts` — correct for the deleted SVG/DOM sink, where the browser rasterized text. With ThorVG rasterizing, `FontFace` in the DOM is irrelevant: **the engine itself needs the font bytes**. This change makes text render by loading font bytes into the ThorVG engine.

Font provisioning is **fetch-by-URL only** — no bundled font, no filesystem reads. A default family fetches a `.ttf` from a CDN; consumers override the URL (or add families) via the scene's `Fonts` annotation / a renderer option. The user downloads the default font only if they don't override it, and Node and browser share one code path (`fetch` in both).

## What Changes

- **Wrap the text C-API in `@effect-motion/thorvg`.** Add `setText`/`setFont`/`setSize`/`setColor`/`align` (and `layout` where needed) over the existing `_tvg_text_*` functions, following the established `checked` pattern. Strings (text content, font name) are marshalled into scratch as UTF-8 (the existing `withScratch` + `HEAPU8` path).

- **Wrap font loading by data.** Add `loadFontData(name, bytes, mimetype = "ttf")` over `_tvg_font_load_data` (pack the byte array into scratch, pass the mimetype string), and `unloadFont(name)`. This registers a named font in the engine that `setFont` then references. ThorVG expects TrueType — the mimetype is `"ttf"`.

- **Fetch fonts by URL, load at engine setup (no bundling).** A `fonts` option on the ThorVG layer/runtime setup takes a map of `family -> ttfUrl`. On acquire, each URL is `fetch`ed to bytes and `loadFontData`'d into the engine (once). A default entry maps the default family (`sans-serif`, matching `Text`'s default) to a pinned CDN `.ttf` URL; consumers override it or add families. Node and browser both use global `fetch`. Nothing is read from disk; nothing is bundled.

- **Bridge the scene's `Fonts` annotation to the renderer setup.** The Node/browser render entry (adapters, react runtime, export `Video.render`) reads the scene's declared fonts (`Fonts.get`), maps `family -> src.url`, and merges them into the layer's `fonts` option so declared families are loaded before rendering. `path`-only entries are ignored (no filesystem in this model).

- **Add the Text paint function.** A `PaintFunction<typeof Shapes.Text>` that makes a text paint, sets the family (`setFont`), content (`setText`), size (`setSize`), color (from `fill`), and alignment (from `textAnchor`/`baseline`), then applies the projection and adds it to the scene. Register it in `builtinPaints`, making the coverage map exhaustive over all built-ins.

- **Rework the `font-loading` behavior for the ThorVG world.** The player's `FontFace`-into-`document.fonts` path is replaced: the player passes declared font URLs to the shared ThorVG runtime so the engine loads them, gating `status` on that load the way it currently gates on `FontFace`. Readiness still waits for fonts; a failed font load still doesn't fail playback.

## Capabilities

### New Capabilities

- `thorvg-text`: rendering `Shapes.Text` through the ThorVG engine — the wrapped text/font C-API, URL-fetched font loading into the engine at setup, the default-font CDN model, and the Text paint function.

### Modified Capabilities

- `font-loading`: the loading contract shifts from "browser loads FontFace for the DOM" to "the ThorVG engine loads font bytes fetched by URL"; the annotation-declaration half is unchanged.

## Impact

- `packages/thorvg/src/api.ts`: add text mutators + `loadFontData`/`unloadFont`. `ThorvgWasm.ts` / the layers gain a `fonts` option (family→url) and fetch+load on acquire.
- `packages/motion/src/render/`: add the Text paint fn + register in `builtinPaints`; the render entries merge `Fonts.get(scene)` URLs into the engine's `fonts`. `FrameMeta` may gain nothing — fonts load at setup, not per frame.
- `packages/react/src/`: `usePlayer`/`runtime` pass declared font URLs to the shared runtime; replace the `FontFace` preload with engine-load gating.
- `packages/export/src/Video.ts`: pass the scene's declared font URLs into the internal ThorVG layer so exported text renders.
- `apps/docs`: the 8 Text examples now render; the `font-loading`/text docs narrative updates to the fetch-by-URL model (docs prose can be a follow-up if scoped out).
- **Deferred (`ponytail:`):** woff2/otf support (TTF only now — the default and declared URLs must be `.ttf`); local/filesystem font sources (`src.path` is ignored — fetch-by-URL only); text measurement/wrapping beyond what `Text`'s existing align fields express; subsetting the default font (full-face download until a consumer overrides).
