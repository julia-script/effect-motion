# Design: restructure-thorvg-lifetimes

## Context

`@effect-motion/thorvg` wraps `@thorvg/webcanvas@1.0.8` (pinned): its glue initializes the wasm and stashes the fully-named module on `globalThis.__ThorVGModule`, which we steal because the closure-minified symbol map exists only inside that glue.

Facts established from source (thorvg.web at tag `webcanvas@1.0.8`, ThorVG core at submodule commit `1eef89b`):

- **F1** Every Embind `TvgCanvas` construction calls `Initializer::init()` and its destruction calls `Initializer::term()` (`wasm/webcanvas/tvgWasmWebCanvas.cpp`, engine destructors).
- **F2** `Initializer` is refcounted (`engineInit++` / `--engineInit > 0 → early return`); `LoaderMgr::term()` — which owns the loaded-font table — runs only when the count reaches zero (`src/renderer/tvgInitializer.cpp`). The observed "canvas delete wipes fonts" happens only when the deleted canvas was the last one.
- **F3** The font mimetype dispatch accepts `"ttf"` and `"otf"` (both → the Sfnt loader); pictures accept `svg`/`svg+xml`, `png`, `jpg`/`jpeg`, `webp`, `lot`/`lottie+json`, `raw` (`src/renderer/tvgLoaderMgr.cpp`). The shipped wasm was built with `-Dloaders=all` and exports `_tvg_picture_load_data`/`_tvg_picture_load_raw`.
- **F4** Each `TvgCanvas` construction also loads a ~12 KB embedded font under the family `"default"`; its destructor frees that buffer (`tvgWasmDefaultFont.h`).

Current pain (see proposal): fake engine scoping (release = `term()`, never actually run), an immortal per-size canvas cache on a module property, `loadFontsIntoEngine` with zero callers, and a 645-line `api.ts`.

## Goals / Non-Goals

**Goals:**

- Model the three real lifetimes (engine / session / paint) as first-class Effect constructs.
- Effect-style module layout matching `packages/motion` (namespace-imported module per concept).
- Session-scoped, refcounted font loading with ttf/otf support; wire the player to `Fonts.urlMap`.
- Expose picture/image loading.

**Non-Goals:**

- Owning the wasm build (the `__ThorVGModule` steal stays, contained in `Engine.ts`).
- webgl/webgpu renderers (SW stays the only exercised path; the option passes through).
- Font family namespacing across scenes (conflict → loud failure now; namespacing is the motion package's future escape hatch if a real collision appears).
- woff/woff2 (engine doesn't accept them; JS-side decompression is speculative).
- Changing the paint tier — `acquirePaint`/ownership-transfer-on-add is kept as-is.

## Decisions

### D1: Keeper canvas pins the engine; sessions own real canvases

On engine acquire, create one 1×1 `TvgCanvas` that is never deleted (the *keeper*). By F1+F2 this holds `engineInit ≥ 1`, so session canvases can be genuine `acquireRelease` resources — created at session open, `delete()`d at close — without wiping the font table. The `__emCanvasCache` module-property hack and `getSharedCanvas` are deleted.

*Alternative considered:* keep the immortal per-size cache. Rejected: it leaks a canvas per size, hides the real lifetime, and the refcount fact removes its reason to exist. *Gate:* task #1 is a spike test (keeper + canvas A, load font, delete A, render text with canvas B). If it falsifies the hypothesis, the session API keeps its shape but its implementation falls back to a per-size cache behind the keeper — callers are unaffected either way.

### D2: Engine release is a no-op in the browser, `term()` in Node

Browser: the module is a page singleton (upstream terms only on `beforeunload`); a Scope pretending to own it is the current bug. `Engine.layer` acquires idempotently (steal-if-present) and its release does nothing. Node/tests: release keeps calling `term()` for clean process isolation, but only when the releasing scope is the one that initialized (refcount in the service, matching F2's own convention).

*Alternative:* refcount in both environments. Rejected for the browser: term-at-zero would still tear down fonts and keeper between unmount and next mount — churn with no benefit on a page.

### D3: Session as a service: `RenderSession`

New `Session.ts` (thorvg package): `Session.make({ width, height, fonts })` — scoped effect that acquires a canvas (D1) and loads fonts (D4), releasing both on close. `Renderer.render` in `packages/motion` takes the session's canvas instead of calling `getSharedCanvas`; resize within a session goes through `canvas.resize` (upstream supports it) rather than canvas-per-size. The React `Player` opens one session per mount; exporters open one per run.

### D4: Refcounted font registry keyed per module

`Font.ts` holds a `WeakMap<module, Map<family, { count, sourceKey, loaded }>>`. `Font.scoped(family, source)`: acquire loads on 0→1 (fetch URL or accept bytes), increments otherwise; release decrements. Same family with a *different* `sourceKey` fails loudly with a `ThorvgException` naming both sources (repo determinism invariant: loud defects naming the offender). Format: sniff magic bytes (`OTTO` → `"otf"`, else `"ttf"`) with an explicit override option; both route to the Sfnt loader (F3).

**Implementation finding (probe, 2026-07-16): the shipped wasm cannot unload data-loaded fonts** — `_tvg_font_unload` returns 5/NotSupported for fonts loaded via `_tvg_font_load_data` (it works only for file-path loads, which don't exist in wasm). So release-at-zero is best-effort: the registry attempts the unload; on rc 0 it drops the entry (a future acquire re-loads), on any other rc it keeps a **tombstone** (`count: 0`, `loaded: true`) so a same-source re-acquire skips the re-upload and a different source claiming the family still conflicts — the engine's old bytes would win anyway. Memory ceiling: distinct fonts used over a page's lifetime, same as upstream's global-forever model. Engine `term()` clears the registry (via `clearLoaded`).

The WeakMap-per-module pattern is kept from today's `loadedByModule` (survives engine recreation under HMR). The default `sans-serif` → Inter fetch remains an engine-acquire default, overridable and skippable exactly as today. The embedded `"default"` family (F4) is documented as always-available.

### D5: Picture module in the existing idiom

`Picture.ts`: `load(picture, bytes, { type })` marshalling through `withScratch` + `checked` (`_tvg_picture_load_data` with the F3 mimetypes), `loadRaw(picture, rgba, { width, height, colorSpace, copy })`, `setSize`, `getSize`, `setOrigin`. Decoded data is paint-tier: the picture paint owns it; no registry. String input (SVG text) is caller-encoded to bytes — one input type, no overloads.

### D6: Module layout mirrors `packages/motion`

```
src/
  Engine.ts      module service + init/steal + keeper + layers (absorbs ThorvgWasm.ts minus fonts/interop)
  Interop.ts     Ptr, Scratch, withScratch, cstr/withCstr, wrap, checked, checkedPtr, acquirePaint, OwnedPaint, freePaint
  Canvas.ts      make (scoped), resize, clear, render, draw, sync, update, addToCanvas
  Session.ts     RenderSession (D3)
  Paint.ts       translate, rotate, scale, opacity, transform, duplicate, aabb, visible
  Shape.ts       path verbs, appendRect/Circle, fill/stroke setters
  Scene.ts       make, addToScene, effects (blur, drop shadow)
  Text.ts        make, setText, setFont, size, color, align
  Font.ts        registry (D4)
  Picture.ts     (D5)
  Gradient.ts    linear/radial, color stops
  Animation.ts   make (unchanged surface)
  ThorvgException.ts, png.ts, node.ts, ThorvgWasmBrowser.ts → Engine's browser layer
```

`index.ts` re-exports namespaces (`export * as Shape from "./Shape"` …), keeping the browser-safe/node split exactly as today. Consumers use `Shape.appendRect(...)` etc. This is a repo-local breaking rename; `@effect-motion/thorvg` is unpublished.

### D7: Player gets the engine from one shared runtime

A module-level `ManagedRuntime` in `@effect-motion/react` holds the engine layer once (the `react-player` spec already requires one engine across players); each `Player` mount builds its per-scene context on top and opens a `RenderSession` with `Fonts.urlMap(scene)` (finally implementing the `font-loading` player requirement). Font-load settlement gates readiness per that spec; individual failures stay logged skips.

**Implementation simplification:** once D2 landed, a separate module-level runtime became redundant — engine acquisition is an idempotent process singleton (adopt-if-present + refcount, browser release a no-op), so per-mount runtimes already share one wasm module (covered by the double-acquire test). The Player therefore keeps one runtime per mount — now genuinely disposed on unmount (strict-mode-safe via a ref that recreates after cleanup), which closes the session (canvas deleted, fonts released) without touching the shared engine. The spec's observable ("one wasm module across players") holds; the "one runtime" phrasing was a means, not the requirement. Session opening awaits font settlement (`Session.make` → `Font.scopedMany`), so the first frame render — and thus readiness — inherently gates on fonts.

## Risks / Trade-offs

- [Keeper hypothesis wrong in wasm practice] → Spike test first (task #1); fallback keeps the session API and hides a per-size cache behind it. Design degrades, API doesn't.
- [Font unload-at-zero churns on quick unmount/remount] → Refcount map retains `bytesLoaded` key; a reload is one fetch (browser cache) + one `_tvg_font_load_data`. If churn shows up in practice, add a small grace period — deferred, `ponytail:` comment at the site.
- [Conflict-on-same-family too strict for docs site with many examples] → Only *different sources for the same family* conflict; identical URLs dedup. Docs examples sharing Inter are the dedup path, not the conflict path.
- [Restructure touches every consumer import] → Mechanical; `pnpm check` catches misses. No behavior change in paint-tier call sites beyond import paths.
- [Node release semantics regress smoke tests] → Node keeps `term()` on release (D2), so existing test isolation is preserved.

## Open Questions

- Does `canvas.resize` after target-buffer reallocation behave identically to fresh-canvas-per-size for the SW renderer? (Spike alongside task #1; upstream's own player resizes freely, so expected yes.)
- Should the keeper also pre-pin on the Node path, where `term()`-on-release is wanted? Plan: keeper is created per engine acquire and deleted in the Node release just before `term()`; browser never releases.
