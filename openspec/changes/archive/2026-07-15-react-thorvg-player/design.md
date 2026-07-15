# Design: React ThorVG Player

## Context

`@effect-motion/react` gives a `usePlayer` hook (buffered streaming playback on a rAF clock) and a `Player` component. It consumes `Scene.stream` frames — that half is renderer-agnostic and stays. The display half targeted the deleted `SvgDomRenderer`: `Player.tsx` did `Effect.runSync(renderer.render(frame, { target }))` per frame, clear-and-rebuilding SVG DOM. The single ThorVG renderer replaces that with `renderToCanvas(frame, builtinPaints, canvasEl)` — an Effect requiring an async-acquired `ThorvgWasm` engine. So the player must: acquire the engine once, hold it across renders, and run each frame's render as an Effect (not `runSync`).

## Goals / Non-Goals

**Goals:**
- One shared ThorVG engine across all players (respects the single `__ThorVGModule` global), acquired lazily on first use.
- Per-frame rendering as an async Effect run on the shared runtime; no per-frame layer construction.
- Canvas viewport sized from frame metadata, responsive via CSS.
- Wasm locatable out-of-the-box (unpkg default) and overridable.
- Frame production (`Scene.stream`, buffer, rAF clock) unchanged.
- Player tests cover behavior (mount, loading→ready, transport, sizing) without depending on wasm pixel reads.

**Non-Goals:**
- Text rendering (separate change — the player draws whatever `builtinPaints` covers).
- SSR/no-DOM player rendering (canvas requires a DOM).
- Bundling the `.wasm` as a package asset (CDN default now; asset bundling deferred).
- Dirty-rect / keyed canvas diffing (full repaint per frame for now).

## Decisions

### D1: Shared engine via a module-level `ManagedRuntime`

`ManagedRuntime.make(layer)` builds a runtime that acquires its layer's resources **lazily on first run** and memoizes them for every subsequent run — exactly the "shared runtime, cached instance" the engine needs. One module-level runtime means N players and every frame share one acquired `ThorvgWasm`:

```
// module scope in usePlayer.ts (or a small runtime.ts)
let runtime: ManagedRuntime.ManagedRuntime<ThorvgWasm, never> | null = null
const getRuntime = (wasmBaseUrl: string) => {
  // first caller's baseUrl wins; the engine is global, so one URL per page
  if (runtime === null) runtime = ManagedRuntime.make(ThorvgWasmBrowser.layer(wasmBaseUrl))
  return runtime
}
```

Why module-level and not per-player or a React provider: the ThorVG module is a single `globalThis.__ThorVGModule` (runtime layer's `ponytail:` note) — two concurrent `init`s race. A per-player engine reintroduces that race; a provider works but forces every consumer (and the docs site) to mount it. A cached module singleton matches the single-global reality with zero consumer API. `ManagedRuntime` gives a real `dispose()` if a full teardown is ever needed (not wired to React unmount — the engine outlives individual players by design, like a GPU context).

`Effect.cached`/`Layer.memoize`: `Effect.cached` exists in beta.94 but caches an *effect's result*, not a layer's resources across independent runs; `Layer.memoize` is absent in this beta. `ManagedRuntime` is the right primitive and is present (`ManagedRuntime.make` verified).

**Caveat (`ponytail:`):** first-caller's `wasmBaseUrl` wins, since the engine is process-global. Documented; a second player with a different URL is a no-op on location. Fine — one page serves one wasm.

### D2: Async render with latest-frame-wins

Rendering is `runtime.runFork(renderToCanvas(frame, builtinPaints, canvas))`. Because it's async, frame N+1 can be requested before frame N's paint finishes. Guard with a per-canvas "latest requested frame" token: when a render resolves, it only matters that the *last* requested frame is the one currently painted, so we track the newest frame index and, on each frame change, cancel/supersede the prior in-flight fiber (`Fiber.interrupt` the previous, or a monotonic token checked before the final blit). The rAF clock already advances at frameRate; renders that can't keep up drop frames (acceptable — the buffer/clock own timing, the sink just paints the current frame).

Concretely: keep the current `useEffect([player.currentFrame])` shape, but instead of `runSync`, fork the render on the runtime and store the fiber; the effect's cleanup interrupts a still-running prior render. Latest frame requested is the one that wins.

### D3: Canvas viewport

The `Player` viewport `<div>` + injected `<svg>` becomes a `<canvas ref>`. `renderToCanvas`/`blitToCanvas` already size the canvas to the framebuffer (`canvas.width/height = frame w/h`). Responsive fit: CSS `width:100%; height:auto` (or the existing aspect-ratio box) so the fixed-pixel canvas scales to the container — the same story as the old `viewBox` post-process, now native to `<canvas>`. The loading overlay and transport bar are unchanged.

### D4: Wasm location — unpkg default, overridable

`ThorvgWasmBrowser.layer(baseUrl)` resolves the `.wasm` via `new URL(file, baseUrl)`. Default:

```
const DEFAULT_WASM_BASE = "https://unpkg.com/@thorvg/webcanvas@1.0.8/dist/"
```

Pinned to the same version as the thorvg package dependency (`^1.0.8`, installed 1.0.8). `usePlayer`/`Player` take an optional `wasmBaseUrl` to override for locally-served assets or offline/CSP-restricted environments. The default makes the docs site and a fresh consumer work with zero config.

**Version-pin coupling (`ponytail:`):** the default URL's version must track `@thorvg/webcanvas`'s pin. A mismatch loads a wasm whose glue symbol map may differ — a loud init failure, not a silent wrong render. Keep the constant next to the dep, note the coupling.

### D5: Tests — behavior over pixels

The wasm engine may not instantiate cleanly under happy-dom, and pixel-reading a canvas there is unreliable. So player tests assert behavior:
- mounts a `<canvas>` in the viewport;
- status goes loading→ready once engine + first frame resolve;
- transport: play advances `frame`, pause halts, seek clamps, loop wraps;
- viewport sized from frame metadata (aspect ratio / canvas dimensions).

Where a test can't run wasm, mock the render boundary (`renderToCanvas`) to a no-op resolving effect so player *logic* is tested without the engine — real rendering is already proven by the motion package's framebuffer tests. Prefer running the real engine in tests if it instantiates under the test env; fall back to the mock only for the display assertions.

## Risks

- **Wasm under the test runtime.** If `TVG.init` won't run in happy-dom/node-test, the display path can't be exercised there. Mitigation: D5's render-boundary mock for player-logic tests; the engine itself is covered by thorvg's own smoke + motion's framebuffer tests (real Node wasm).
- **CDN dependency at runtime.** The unpkg default fetches the `.wasm` over the network. Offline/CSP consumers must set `wasmBaseUrl`. Mitigation: documented option; a loud init failure if the fetch is blocked, not a silent hang (surfaced through the player's existing `error` status).
- **Async-render tearing.** Without the latest-wins guard, a slow frame-N render could paint after frame N+1. Mitigation: D2 supersede/interrupt.
- **Engine never released.** The module runtime outlives players. Intended (shared context), but a long-lived SPA that mounts/unmounts many players keeps one engine forever. Acceptable — one wasm module is cheap; `dispose()` is available if a host wants teardown.

## Migration

Pre-release, no external consumers. Internal consumer is the docs site (`apps/docs`), whose `<Player>` usage is unchanged at the call site (same props) except it now needs the wasm to load — the unpkg default covers it. A separate docs change (with Text) does the broader rewrite; this change makes the player itself work.
