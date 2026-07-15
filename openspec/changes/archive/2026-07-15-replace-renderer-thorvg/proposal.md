> **STATUS: REJECTED at the gate (2026-07-15).** The task-#1 headless-Node proof
> failed — `@thorvg/webcanvas` is browser-only (`Canvas` needs `document`, no
> pixel readback, no headless WASM build). Full replacement is not feasible with
> today's ThorVG packages, so nothing shipped: the SVG sinks + resvg stay. The
> idea is kept open — see design.md → "Gate Outcome" for the empirical findings
> and four re-scoping options to revisit if ThorVG ships a headless build.

## Why

We maintain three rendering paths — `SvgRenderer` (self-contained string), `SvgDomRenderer` (live DOM), and `@effect-motion/export`'s resvg SVG→PNG rasterizer — because the conveniences of the browser DOM aren't available in Node, and we don't want to depend on a headless browser (Puppeteer) for offline export. This split has a real cost: **text renders differently between the browser and resvg** (two different font engines), so live preview and exported video don't match, and we have little control over it. Maintaining three sinks plus a rasterizer is also pure overhead.

[ThorVG](https://github.com/thorvg/thorvg) is a portable 2D vector engine with an imperative scene-graph API (`Shape`, `Scene`, `Canvas`, path/fill/transform) and its own font rasterizer, shipping as WASM (`@thorvg/webcanvas`) with software, WebGL, and WebGPU backends. Because it is **the same rasterizer everywhere**, browser and Node produce identical pixels — text included. It slots into the exact seam our renderer already exposes (a depth-sorted list of paintables with projected 2D transforms), so adopting it replaces the leaf-paint and rasterize stages while leaving the entire 2.5D projection pipeline untouched.

Decision: **replace all rendering with ThorVG.** No backwards-compatibility concern.

## What Changes

- **NEW — ThorVG canvas sink.** A single sink drives ThorVG: browser uses the `Gl`/`Wg` canvas (GPU) for live playback, Node uses the `Sw` (software) canvas headless (WASM → pixel buffer) for export. One renderer, two backends, same draw code.
- **BREAKING — the sink contract becomes a renderer-agnostic draw-list, not `SvgNode`.** The deterministic contract is "these shapes, at these coordinates, with these fills, in this paint order." `SvgNode` (an SVG-specific vnode) is replaced by a neutral paint description the ThorVG sink consumes. Determinism is asserted on this draw-list, never on rasterized pixels.
- **BREAKING — remove the SVG sinks.** `SvgRenderer`, `SvgDomRenderer`, `svg/project.ts`, `svg/SvgNode.ts` and the `svg/` shape serializers are deleted once ThorVG is proven headless.
- **BREAKING — rework `@effect-motion/export`.** The `Scene.stream → SVG string → resvg → ffmpeg` chain becomes `Scene.stream → ThorVG scene → pixel buffer → ffmpeg`. `Resvg.ts` and the `@resvg/resvg-js` dependency are removed; ffmpeg encoding stays.
- **NEW — headless-Node proof gates everything.** The first implementation task proves ThorVG's software backend rasterizes to a pixel buffer in Node with no browser. Nothing is deleted until it passes; if it fails, the SVG sinks stay and the change is reconsidered.
- **Text becomes consistent** across preview and export by construction (one font rasterizer).

## Capabilities

### New Capabilities

- `thorvg-renderer`: The ThorVG canvas sink — browser GPU + Node software backends from one draw path; consumes the depth-sorted paintables and rasterizes.
- `draw-list`: The renderer-agnostic paint description that replaces `SvgNode` as the deterministic sink contract (shapes, coordinates, fills, stroke, paint order).

### Modified Capabilities

- `video-encoding`: the one-call `render` path rasterizes via ThorVG's software buffer instead of resvg PNG bytes; the ffmpeg encode stage is unchanged.
- `react-player`: the Player mounts a ThorVG canvas instead of an SVG element; playback/transport semantics are unchanged.
- `font-loading`: export maps declared fonts to ThorVG's rasterizer rather than resvg options, unifying font loading across browser and Node.

### Removed Capabilities

- `svg-rendering`: the `SvgNode` contract, string sink, and DOM sink are removed — replaced by `draw-list` + `thorvg-renderer`.
- `resvg-rasterization`: the SVG→PNG rasterizer is removed — ThorVG rasterizes directly to a pixel buffer.

## Impact

- **Removed:** `packages/motion/src/svg/SvgRenderer.ts`, `SvgDomRenderer.ts`, `SvgNode.ts`, `project.ts`, `shapes.ts` (SVG serializers), `layers.ts`, `camera.ts` remnants; `packages/export/src/Resvg.ts`; the `@resvg/resvg-js` dependency.
- **Added:** a ThorVG sink module in `packages/motion` (browser + Node backends), the `@thorvg/webcanvas` (or equivalent WASM) dependency, a draw-list type replacing `SvgNode`.
- **Rewritten:** `Renderer.ts`'s `RenderFunction`/sink contract (emit draw-list nodes, not `SvgNode`); `packages/react`'s `Player`/`usePlayer` to mount a ThorVG canvas instead of an SVG element; `@effect-motion/export`'s `Video.ts` to rasterize via ThorVG.
- **Determinism:** unchanged in spirit — asserted on the draw-list (deterministic, we compute it), never on GPU pixels. Tests move from SVG-string assertions to draw-list assertions.
- **Risk (load-bearing):** ThorVG headless-Node WASM rendering is unconfirmed by docs; it gates the change (see design). GPU-backend pixel variance is a non-issue because we never assert on pixels.
- **Docs:** the two SVG-sink mentions and the export path's resvg description are rewritten; runnable examples are unaffected (they go through the Player, which swaps its canvas).
