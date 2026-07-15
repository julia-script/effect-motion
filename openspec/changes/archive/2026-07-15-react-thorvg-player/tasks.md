# Tasks: React ThorVG Player

## 1. Dependency + shared runtime

- [x] 1.1 Add `@effect-motion/thorvg` (workspace) to `packages/react/package.json` dependencies
- [x] 1.2 Module-level shared engine: `getRuntime(wasmBaseUrl)` lazily builds one `ManagedRuntime.make(ThorvgWasmBrowser.layer(wasmBaseUrl))` and reuses it (design D1). `DEFAULT_WASM_BASE = "https://unpkg.com/@thorvg/webcanvas@1.0.8/dist/"` next to the constant, with the version-pin `ponytail:` note (design D4)

## 2. usePlayer: async render entry

- [x] 2.1 Add a `wasmBaseUrl?: string` option to `UsePlayerOptions`; default to `DEFAULT_WASM_BASE`
- [x] 2.2 Expose a `renderFrame(frame, canvas)` that runs `renderToCanvas(frame, builtinPaints, canvas)` on the shared runtime (`runtime.runFork`), returning the fiber so the caller can supersede it (design D2)
- [x] 2.3 Fold engine-readiness into `status`: `loading` until engine acquired AND first frame buffered; `error` on engine acquisition failure (design D5, spec). Frame-production/buffer/rAF logic stays unchanged

## 3. Player: canvas viewport

- [x] 3.1 Replace the viewport `<div>`+injected `<svg>` with a `<canvas ref>`; drop the `Effect.runSync` render and the `viewBox`/CSS post-process (design D3)
- [x] 3.2 On `currentFrame` change, fork the render via `renderFrame`; the effect cleanup interrupts a still-running prior render (latest-wins, design D2)
- [x] 3.3 Responsive sizing: canvas sized to frame metadata by the adapter; CSS `width:100%`/aspect-ratio box for fit (design D3)

## 4. Tests → behavior/canvas

- [x] 4.1 Rewrite `player.test.tsx`: assert a `<canvas>` mounts, status transitions loading→ready, transport (play/pause/seek/loop) advances/halts/clamps/wraps `frame`, and metadata sizing — not SVG DOM (design D5)
- [x] 4.2 Retarget any SVG assertions in `usePlayer.test.tsx` / `fonts.test.tsx`; keep the frame-production/buffer/font-preload logic tests as-is
- [x] 4.3 Where wasm can't run under the test env, mock the `renderToCanvas` boundary to a resolved no-op so player logic is tested without the engine (design D5). Prefer the real engine if it instantiates

## 4b. Browser-safe packaging (surfaced by 5.2 — the Node entry leaked into the browser bundle)

- [x] 4b.1 Split `@effect-motion/thorvg` barrel: `.` = browser-safe (api, ThorvgWasm, ThorvgWasmBrowser, errors); new `./node` subpath = Node-only (`ThorvgWasmNode`, `savePng`, `encodePng` — the `node:fs`/`node:zlib` bits). `exports` map added
- [x] 4b.2 Split `effect-motion` render barrel: `renderToCanvas`/`blitToCanvas`/`builtinPaints` stay on `.`; the Node adapters (`renderToBuffer`/`renderToPng`) move to a new `effect-motion/render-node` subpath (they pull thorvg's `/node`). Retarget demo/demo-viewer/test helper
- [x] 4b.3 Consumer bundler shim for the `@thorvg/webcanvas` glue's Node-only `import("module")`: added a turbopack `resolveAlias` + webpack `resolve.fallback` + empty shim in `apps/docs/next.config.mjs`. This is the documented requirement for any consumer bundling the player

## 5. Verify

- [x] 5.1 `pnpm --filter @effect-motion/react test` passes (25/25); react typechecks against the new motion API (0 errors). All three packages: 246 tests pass, 0 type errors
- [x] 5.2 Drove the player in the docs `/scratchpad` against a real scene: engine loaded from the default unpkg URL, the purple circle rendered onto the `<canvas>`, transport reached `0:01 / 0:01` — verified by screenshot. (This is the step that surfaced the packaging leak in 4b.)
- [x] 5.3 Confirmed two `getRuntime()` calls return the same runtime object and the engine is usable from both — one shared engine, no double acquisition (headless check, Node layer)
