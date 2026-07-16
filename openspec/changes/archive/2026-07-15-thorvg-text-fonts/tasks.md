# Tasks: ThorVG Text & Fonts

## 1. Text + font C-API wrappers (packages/thorvg/src/api.ts)

- [x] 1.1 UTF-8 string helper: encode a JS string to NUL-terminated bytes into scratch (`TextEncoder` + `withScratch` + `writeBytes`), returning the pointer for text/name args (design D1)
- [x] 1.2 Text mutators over `checked`: `setText(text, str)`, `setFont(text, family)`, `setSize(text, px)`, `setColor(text, r, g, b)`, `align(text, halign, valign)` (design D1/D4)
- [x] 1.3 `loadFontData(name, bytes, mimetype = "ttf")` over `_tvg_font_load_data` (pack name + bytes into scratch, `copy = 1`) and `unloadFont(name)` over `_tvg_font_unload` (design D1)
- [x] 1.4 Verify the `_tvg_text_align` halign/valign enum integer values against the live module; record the mapping used by D4

## 2. Font loading at engine setup (packages/thorvg/src/ThorvgWasm.ts + layers)

- [x] 2.1 Add a `fonts?: Record<string, string>` option (family→ttfUrl) to the layer/runtime setup; default it to `{ "sans-serif": DEFAULT_FONT_URL }` (design D2)
- [x] 2.2 Pin `DEFAULT_FONT_URL` to a CORS-open, static-weight **`.ttf`** CDN asset (NOT the Google Fonts CSS/woff2 endpoint); a load-time glyph smoke confirms it loads into ThorVG (design D2, risk)
- [x] 2.3 On acquire (after `init`), `fetch` each family URL → bytes → `loadFontData` (concurrent, once). A failed fetch/load warns and is skipped — acquisition still succeeds (design D2)
- [x] 2.4 Node uses global `fetch` (Node ≥18); browser uses global `fetch`. One code path (design D2)

## 3. Scene fonts → engine (render entries)

- [x] 3.1 Node adapters / export `Video.render`: read `Fonts.get(scene)`, map `src.url` entries to family→url, merge over the default, pass as the ThorVG layer's `fonts` (design D3)
- [x] 3.2 React `usePlayer`/`runtime`: pass declared font URLs into `getRuntime` → the browser layer's `fonts`; note the shared-engine one-font-table limitation (`ponytail:`) (design D3)
- [x] 3.3 A declared entry with the default family overrides the default URL; `path`-only entries skipped (design D3)

## 4. Text paint function (packages/motion/src/render)

- [x] 4.1 `PaintFunction<typeof Shapes.Text>`: makeText → setFont(fontFamily) → setText(text) → setSize(fontSize) → setColor(parseColor(fill)) → align(textAnchor, baseline) → opacity + `finishPaint` (design D4)
- [x] 4.2 Register Text in `builtinPaints`; extend the exhaustive union so the coverage map has no Text gap. Remove the "Text deferred" notes in render/index.ts + shapes.ts

## 5. Rework font-loading contract (packages/react)

- [x] 5.1 Replace the `FontFace`-into-`document.fonts` preload in `usePlayer` with passing declared font URLs to the shared runtime (the engine loads them); gate `status` on the engine font-load settling (design D5)
- [x] 5.2 A failed engine font load warns and still reaches `ready`; frame production unchanged

## 6. Verify

- [x] 6.1 A ThorVG smoke: load the default font, draw one Text, assert non-background glyph pixels in the framebuffer (extends the existing pixel-layout smoke)
- [x] 6.2 `pnpm --filter @effect-motion/thorvg --filter effect-motion test` pass; motion's `builtinPaints` typechecks as exhaustive
- [x] 6.3 Drive a Text scene end-to-end: Node `renderToPng` produces a PNG with visible glyphs; the docs `/scratchpad` (or a Text example) renders text in the browser — screenshot as proof
- [x] 6.4 `pnpm build` green (incl. `next build`); the docs Text examples render
