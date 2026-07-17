# Restructure @effect-motion/thorvg: modules, lifetimes, fonts, images

## Why

The thorvg package works but models its resource lifetimes wrong: the wasm engine is acquired per-player with a `term()` release that would kill every other player on the page if a runtime were ever disposed (today it "works" because runtimes leak); the render canvas is an eternal per-size cache stashed on the module object (a workaround for a font-table wipe that is actually just ThorVG's `Initializer` refcount hitting zero); and scene-declared fonts never reach the engine (`loadFontsIntoEngine` has zero callers). The API is also clumped into one 645-line `api.ts` instead of the effect-style module-per-concept layout used by `packages/motion`.

## What Changes

- **Three explicit lifetime tiers** replacing the current accidental ones:
  - *Engine tier* (page/process): the wasm module as a true singleton whose browser release is a no-op, plus a keeper canvas that pins ThorVG's refcounted `Initializer` ≥ 1 so the font table survives canvas churn (verified against ThorVG source at the pinned submodule commit; a spike test confirms it empirically first).
  - *Session tier* (player mount / export run): a properly `acquireRelease`-scoped canvas (created on mount, deleted on unmount — safe once the keeper exists) and the scene's fonts, loaded on session open and released on close. Replaces the never-deleted `__emCanvasCache` per-size cache.
  - *Paint tier* (per frame): unchanged — the existing `acquirePaint` + ownership-transfer-on-add design stays.
- **Refcounted font registry**: scoped `Font` loading with per-module dedup, unload when the last session releases a family, loud failure on conflicting sources for the same family, and `ttf`/`otf` support (both accepted by ThorVG's loader dispatch) with format sniffing from magic bytes.
- **Images API**: expose `Picture` loading (`svg`, `png`, `jpg`/`jpeg`, `webp`, `lot`, `raw` — all loaders are compiled into the shipped wasm) plus size/origin, in the existing scratch/checked idiom.
- **Module restructure** **BREAKING**: split `api.ts`/`ThorvgWasm.ts` into effect-style modules (`Engine`, `Interop`, `Canvas`, `Paint`, `Shape`, `Scene`, `Text`, `Font`, `Picture`, `Gradient`, `Animation`) consumed as namespace imports, mirroring `packages/motion`. Import paths and some names change; `@effect-motion/thorvg` is unpublished and internal, so the break is repo-local.
- **Player wiring**: the React `Player` gets the engine from one shared process-level runtime (as the `react-player` spec already requires) and opens a session per mount that loads `Fonts.urlMap(scene)` (as the `font-loading` spec already requires but nothing implements).
- The `globalThis.__ThorVGModule` steal stays, contained in `Engine.ts` (upstream's closure-minified glue leaves no alternative until we own the wasm build).

## Capabilities

### New Capabilities

- `thorvg-fonts`: engine-level font loading as a refcounted, session-scoped resource — dedup, conflict detection, ttf/otf formats, unload-at-zero.
- `thorvg-images`: picture/image loading API over ThorVG's compiled-in decoders (svg, png, jpg, webp, lottie, raw) with size and origin control.

### Modified Capabilities

- `thorvg-runtime`: "Scoped module acquisition" changes — the engine becomes a process-level singleton (browser release no longer runs `term()`); new requirements for the keeper canvas pinning the engine refcount and for session-scoped canvases replacing the shared-canvas cache.
- `font-loading`: the player requirement gains release semantics — declared fonts are loaded through the session-scoped registry and released (refcounted) when the player unmounts.

## Impact

- `packages/thorvg/src/*` — full restructure (moves + the new `Font`/`Picture` modules; `api.ts` and `ThorvgWasm.ts` dissolve).
- `packages/motion/src/Renderer.ts`, `render/*` — import-path updates; `Renderer.render` switches from `getSharedCanvas` to the session canvas.
- `packages/react/src/Player.tsx` — engine moves out of the per-player runtime into a shared module-level runtime; a per-mount session provides canvas + fonts.
- `packages/motion` exporters (`PngExporter`, `CanvasExporter`) — session-scoped canvas instead of the shared cache.
- Tests: existing thorvg smoke tests plus a new spike test for the keeper-canvas hypothesis (task #1 — if it fails, the session-canvas design falls back to the current shared-cache behavior behind the same API).
- No dependency changes; `@thorvg/webcanvas` stays pinned at 1.0.8.
