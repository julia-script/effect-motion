# React ThorVG Player

## Why

`thorvg-single-renderer` collapsed effect-motion to one ThorVG renderer and deleted the SVG sinks. `@effect-motion/react` still targets the old sink: `Player.tsx` renders **synchronously** (`Effect.runSync`) against the pure `SvgDomRenderer`, clearing and rebuilding SVG DOM per frame. That path no longer exists — the package does not compile against the new motion API, and even if it did, ThorVG rendering is not synchronous: it needs a wasm engine that is **acquired asynchronously and held across renders**, and its paint calls are Effects.

This change reworks the player to drive the single ThorVG renderer's browser adapter (`renderToCanvas`) against a `<canvas>` the player owns, with the engine acquired once and **shared across all players** via an Effect `ManagedRuntime` (the single-engine constraint from the runtime layer's `ponytail:` note — one `globalThis.__ThorVGModule` — makes a shared engine correct, not just cheaper). Frame production (`Scene.stream`, the rAF clock, the read-ahead buffer) is untouched; only the sink changes.

## What Changes

- **Shared, lazily-acquired engine via `ManagedRuntime`.** A module-level `ManagedRuntime.make(ThorvgWasmBrowser.layer(wasmBaseUrl))` acquires the ThorVG engine on first use and reuses that one instance for every player and every frame. This is the "shared runtime, cached instance" model: N players → one wasm engine, no globalThis race, and a real dispose story (`runtime.dispose()`). `usePlayer` runs each frame's `renderToCanvas` effect against this runtime (`runtime.runFork`/`runPromise`), never a per-frame `runSync` against a fresh layer.

- **Async render, not sync.** Rendering a frame becomes an Effect (`renderToCanvas(frame, builtinPaints, canvasEl)`) executed on the shared runtime. The player's frame-display effect (currently `Effect.runSync` in `Player.tsx`) becomes a fire-and-forget run against the runtime, guarded so a superseded frame's in-flight render can't clobber a newer one (latest-frame-wins).

- **Canvas viewport, not SVG DOM.** The `Player` viewport becomes a `<canvas>` the player owns and sizes from frame metadata; `renderToCanvas` blits each frame onto it. The old `viewportRef` SVG-injection + `viewBox`/CSS-scaling post-process is replaced by canvas sizing + CSS `width:100%` for responsive fit.

- **Wasm location: default to pinned unpkg, overridable.** The browser layer needs a base URL for the `.wasm`. Default to the pinned `https://unpkg.com/@thorvg/webcanvas@<pinned>/dist/` so the player works out of the box (docs site included); expose a `wasmBaseUrl` option on `usePlayer`/`Player` for consumers whose bundler serves the asset locally or who are offline/CSP-restricted.

- **New dependency.** `@effect-motion/react` gains `@effect-motion/thorvg` (workspace) — it needs `ThorvgWasmBrowser.layer` and the renderer's `renderToCanvas`/`builtinPaints` (re-exported from `effect-motion`'s `Render`). No new third-party runtime dep beyond thorvg's own.

- **Tests → canvas + behavior assertions.** The player tests assert SVG DOM (`svg circle`, `cx="0"`), which is gone. Rewrite them to assert player *behavior*: mounts a `<canvas>`, transitions loading→ready once the engine + first frame are available, transport (play/pause/seek/loop) advances frames, and metadata sizing. Not pixel assertions (wasm pixel-reads under happy-dom are unreliable — the motion package's framebuffer tests already cover real rendering).

## Capabilities

### New Capabilities

- `react-player`: the ThorVG-backed React player — shared-engine acquisition via `ManagedRuntime`, async per-frame canvas rendering, wasm-location option, and the canvas viewport. (The old player's behavior was never captured as an openspec capability; this establishes it for the new renderer.)

## Impact

- `packages/react/package.json`: add `@effect-motion/thorvg` (workspace) dependency.
- `packages/react/src/usePlayer.ts`: add the shared `ManagedRuntime`, a `wasmBaseUrl` option, and a `renderFrame(frame, canvas)` runner against the runtime. Frame-production/buffer/rAF logic unchanged. Expose the canvas-render entry the `Player` calls.
- `packages/react/src/Player.tsx`: viewport becomes a `<canvas>`; drop the SVG `Effect.runSync` + `viewBox` post-process; call the async render on frame change with latest-wins guarding.
- `packages/react/test/*`: rewrite `player.test.tsx` (canvas + behavior), keep `usePlayer.test.tsx`/`fonts.test.tsx` logic but retarget any SVG assertions; the test env must instantiate the wasm engine (Node/happy-dom) or mock the render boundary where wasm can't run.
- **Determinism/perf note:** rendering is now async, so a frame's paint may complete after the next frame is requested; the latest-frame-wins guard keeps the displayed frame correct. ponytail: full canvas repaint per frame (mirrors the old clear-and-rebuild ceiling) — keyed/dirty-rect upgrade deferred.
- **Deferred (not in scope):** Text rendering in scenes (its own change — the player renders whatever `builtinPaints` covers); SSR/no-DOM rendering of the player (canvas needs a DOM); bundling the `.wasm` as a package asset instead of the CDN default.
