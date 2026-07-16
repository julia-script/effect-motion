# Design: ThorVG Text & Fonts

## Context

`Shapes.Text` is a complete entity but the ThorVG renderer can't paint it: `builtinPaints` omits it, `api.ts` wraps only `_tvg_text_new`, and the wasm ships no default font. ThorVG renders text by (1) loading a named font into the engine from TrueType bytes (`_tvg_font_load_data`), then (2) building a text paint that references that family (`_tvg_text_set_font` + `set_text`/`set_size`/`set_color`/`align`). Both halves are unwrapped today.

Font provisioning is **fetch-by-URL only**: no bundled font, no filesystem. A default family maps to a pinned CDN `.ttf`; consumers override or extend it. The user downloads the default only if they don't override. Node and browser share one path (`fetch` exists in both — Node ≥18/24).

## Goals / Non-Goals

**Goals:**
- Wrap the text + font-load C-API in the bindings, following the existing `checked`/`withScratch` patterns.
- Load fonts into the engine at layer/runtime setup from URLs (default + scene-declared), once.
- A Text paint function honoring family, content, size, color (from `fill`), and alignment.
- Node, browser, and export all render text with the same engine-load path.
- Readiness still gates on font loads (player), a failed load never fails rendering/playback.

**Non-Goals:**
- Bundling a font, or reading fonts from disk (`src.path` is ignored).
- woff2/otf (TTF only; the mimetype passed is `"ttf"`).
- Text measurement/wrapping beyond `Text`'s existing align fields (`layout`/`wrap_mode` wrapped only if the paint fn needs them).
- Subsetting the default font.

## Decisions

### D1: Wrap the text + font C-API (`api.ts`)

Add, over the vendored `_tvg_text_*` / `_tvg_font_*` signatures, following `checked`:
- `setText(text, utf8)`, `setFont(text, name)` — marshal the JS string to UTF-8 in scratch (`TextEncoder` → `withScratch` → `writeBytes`, NUL-terminated) and pass the pointer.
- `setSize(text, px)`, `setColor(text, r, g, b)` — numeric passthrough.
- `align(text, halign, valign)` — numeric enums (D4 maps the Text fields to these).
- `loadFontData(name, bytes: Uint8Array, mimetype = "ttf")` — pack `name` (UTF-8) and `bytes` into scratch, call `_tvg_font_load_data(namePtr, dataPtr, size, mimePtr, copy=1)`. `copy=1` so ThorVG owns its copy and the scratch can free. Returns after a `checked` success.
- `unloadFont(name)` — over `_tvg_font_unload`.

Text is a Paint, so `makeText` already goes through `acquirePaint`/`freePaint` (unchanged). Fonts are engine-global (not paints); `loadFontData`/`unloadFont` are plain `checked` calls, not `acquireRelease` — a font loaded once lives for the engine's life (see D2).

### D2: Load fonts at engine setup, from URLs

The ThorVG layer/runtime setup gains a `fonts?: Record<string, string>` option (`family -> ttfUrl`). On acquire, after `init`, for each entry: `fetch(url)` → `arrayBuffer` → `loadFontData(family, new Uint8Array(buf))`. Loads run once, concurrently, before the service is handed out. A failed fetch/load is logged and skipped — text in that family falls back to whatever ThorVG resolves (which, with no other font, is nothing; a warning names the family).

Why at setup and not per-frame: ThorVG's model is load-once, reference-by-name; a frame-exact renderer paints thousands of text paints and must not re-fetch. The engine outlives frames (the react runtime is shared, the Node adapter's scope wraps the whole stream), so one load per family per engine is correct.

**Default family:** the option defaults to `{ "sans-serif": DEFAULT_FONT_URL }` where `DEFAULT_FONT_URL` is a pinned CDN `.ttf` (a static-weight TrueType — e.g. a Google Fonts static TTF, NOT the CSS/woff2 endpoint). `sans-serif` matches `Text`'s default `fontFamily`, so default text renders with zero config. Consumers override the whole map or add families.

**`ponytail:` the default URL is a network dependency** at engine acquire; offline/CSP consumers pass their own `fonts` (or an empty map to skip). A pinned version keeps the bytes stable. TTF-only: the URL must resolve to TrueType bytes, not woff2.

### D3: Bridge the scene `Fonts` annotation → engine `fonts`

The renderer has no font access today, and `FrameMeta` stays font-free (fonts load at setup, not per frame). Instead the **render entry points** merge declared fonts into the engine option:
- **Node adapters / export `Video.render`:** before constructing the ThorVG layer, read `Fonts.get(scene)`, map each entry with a `src.url` to `family -> url`, merge over the default, and pass as the layer's `fonts`. `path`-only entries are skipped (no filesystem).
- **React:** `usePlayer` reads `Fonts.get(scene)` and passes the URL map to `getRuntime` (which threads it into the browser layer's `fonts`). Since the runtime is process-shared and fonts load once, the first player's font set wins for a family; additional families from later players are a known limitation (`ponytail:` — the shared engine is one font table).

A declared entry with the same `family` as the default overrides the default URL — so a scene can replace the default sans by declaring `{ family: "sans-serif", src: { url } }`.

### D4: The Text paint function

`PaintFunction<typeof Shapes.Text>`:
1. `makeText()`.
2. `setFont(text, data.fontFamily)` — the family must have been loaded at setup (D2/D3); if not, ThorVG draws nothing (loud-ish: a dev warning at load time already fired).
3. `setText(text, data.text)`, `setSize(text, data.fontSize)`.
4. `setColor` from `data.fill` (parse via the existing `parseColor`; text uses fill, not stroke).
5. `align(text, halign, valign)` — pass `textAnchor`/`baseline` through as normalized anchors (0/0.5/1). **Verified finding:** in this binding `_tvg_text_align` accepts the call (rc 0) but does NOT visibly reposition a translated single-line text, and text bounds are not measurable before `update`/draw (pre-draw `getAabb` returns garbage). So precise anchor/baseline alignment is not cleanly achievable without a heavyweight measure-then-reposition pass (add→update→read obb→remove→re-add) per text.
6. Apply `data.opacity` (via `setOpacity`) and the projection (`finishPaint`), then `addToScene`.

Register in `builtinPaints`, extending the exhaustive union — Text is no longer a coverage gap.

**Positioning (verified):** ThorVG text anchors at its paint transform's origin (left/top of the first glyph baseline area); `Text`'s `x`/`y` are that anchor, projected like every billboard. This renders correctly (probe: 11,599 glyph pixels for `Text{text:"Hello"}`). Precise `textAnchor`/`baseline` alignment is a **`ponytail:` deferral** — the align call is passed through (harmless) but center/right/baseline offsets are not applied; adding a measure-then-reposition pass is the upgrade path if a scene needs exact alignment. This is a smaller, correct first cut, not a wrong one: default (left/top) text is exact.

### D5: Rework `font-loading` for the engine

The player's `FontFace`-into-`document.fonts` preload is replaced by passing font URLs to the shared runtime so the ThorVG engine loads them. `status` gates on the engine's font-load settling (as it currently gates on `FontFace` settling); a failed font load warns and proceeds. The annotation-declaration requirement (scenes declare via `Fonts`, runtime never reads it, frames unaffected) is unchanged — only the consumer-side loading contract changes from FontFace to engine-load.

## Risks

- **Google-Fonts-serves-woff2.** The Google Fonts CSS API returns woff2 by default; ThorVG needs raw TTF. The default URL MUST point at a static-weight `.ttf` asset (e.g. the `google/fonts` repo raw TTF, or a gstatic TTF variant), verified to load into ThorVG before it's pinned. Mitigation: a load-time smoke that draws one glyph and asserts a non-background pixel.
- **CORS / CSP on the CDN fetch (browser).** The default URL host must send permissive CORS for `fetch` from the docs origin; a blocked fetch means no text. Mitigation: pick a CORS-open CDN for the default; document that consumers override for locked-down environments. A blocked fetch is a logged skip, not a render crash.
- **Shared-engine font table (react).** One process-global engine means one font table; a second player declaring a different URL for an already-loaded family is a no-op. Acceptable for now (`ponytail:` in D3).
- **Text metrics.** ThorVG lays glyphs from the font; without measurement, multi-line/wrapped text isn't expressed (Text is a single-run leaf by design). No change to that contract.

## Migration

Pre-release. The existing `font-loading` spec's player requirement is replaced (D5); `text-entity` is unchanged. No consumer migration beyond the internal player/export wiring, done in this change. Scenes that never use Text are unaffected (no font fetch happens unless a Text is painted... except the default font loads on acquire regardless — `ponytail:` note: skip the default fetch when the scene declares no Text, if the eager download proves wasteful).
