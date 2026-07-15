# Tasks: ThorVG Single Renderer

## 1. Thorvg binding addition (packages/thorvg — the only change there)

- [x] 1.1 Add `setTransform(paint, { a,b,c,d,e,f })` to `api.ts`: pack the 2D affine into a 3×3 `Tvg_Matrix` via `withScratch(36)` (row-major: `[a c e / b d f / 0 0 1]`), `checked("_tvg_paint_set_transform", …)` (design D5; `thorvgemscripten.ts:84`)
- [x] 1.2 Extend the existing one-rect smoke to assert a framebuffer pixel color (draw red rect, read center pixel), pinning the buffer layout (RGBA order/premultiply) the Node adapter depends on (design risk) — confirmed straight RGBA8888 `[255,0,0,255]`

## 2. De-genericise the renderer (packages/motion/src/Renderer.ts)

- [x] 2.1 Delete the generic `make<Out, Cfg>()` factory, `makeEntityRendererContext`/`Service`/`Layer`, and `getEntityRenderer`
- [x] 2.2 Keep the flatten → world-offset → project → quad → depth-sort logic verbatim as a single non-generic `render(frame, canvas, scene)`; preserve visibility skip, cycle/duplicate/unknown-id defects, and stable id tie-break sort (design D1)
- [x] 2.3 Resolve paint functions via a plain exhaustive `entity.name → PaintFunction` map (type-level coverage of the built-in union), not a Context service per key (design D2)

## 3. Direct-paint entity contract (packages/motion/src/, new render module)

- [x] 3.1 Define `PaintFunction<Ent>` (payload: entity/id/data/projection/canvas/scene; returns `Effect<void, ThorvgException, Thorvg | Scope>`) (design D2)
- [x] 3.2 Projection helper: apply `projection.screen` via `setTransform`, skipping the identity affine; cull `scale <= 0`; a `quad` becomes `moveTo`+`lineTo`×3+`close` filled with the shape's style (design D3)
- [x] 3.3 Paint functions for each built-in: Circle, Rect, Square, Ellipse, Line, Group (paints nothing), ParticleField. **Text and Path deferred** — Text needs engine font loading (no default font in the wasm) + text-mutator wrappers; Path needs an SVG-`d` parser. Both are their own follow-up (see render/index.ts note); geometric shapes render end-to-end.
- [x] 3.4 The exhaustive `builtinPaints` record (typed `PaintFunctions<...>`) that registers all built-in paint functions (replaces `svg/shapes.ts` `shapesLayer`)

## 4. Output adapters (packages/motion/src/)

- [x] 4.1 Node adapter (`render/node.ts`): `renderToBuffer` + `renderToPng` — run the renderer, `canvas.update/draw/sync`, read the SW framebuffer, `encodePng(rgba, w, h)` → PNG `Uint8Array` (design D4). Shared `renderFramebuffer` core in `render/core.ts`
- [x] 4.2 Browser adapter (`render/browser.ts`): `blitToCanvas` + `renderToCanvas` — `ctx.putImageData(new ImageData(clamped, w, h))` onto a target `HTMLCanvasElement` (design D4)

## 5. Delete the SVG backend

- [x] 5.1 Delete `packages/motion/src/svg/` (8 files) and the old `particles/render.ts` (SVG particle render fn)
- [x] 5.2 Remove the `Svg` re-export from `packages/motion/src/index.ts`; export `Render` (renderer adapters + paint fns) instead. Dropped `particles` `render` re-export

## 6. Rewire consumers

- [x] 6.1 `packages/motion/src/demo.ts`: swap `shapesLayer`/`Svg` for `renderToPng` + `builtinPaints` + `ThorvgWasmNode.layer`; renders the mid frame to a PNG (verified: 500×300, real anti-aliased shapes)
- [~] 6.2 **Deferred to a follow-up change** — `@effect-motion/react` needs an async-acquired ThorVG engine held across renders (the old player rendered synchronously against the pure SVG DOM sink). That's an architectural rework of `usePlayer`/`Player`, its own change. This change leaves the react package uncompiled against the new API.
- [~] 6.3 **Deferred to a follow-up change** — the docs player and Text examples depend on 6.2 (react) and Text rendering (deferred), so a full docs rewrite belongs with those. Not rewritten here.
- [x] 6.4 Migrate the SVG-coupled tests to framebuffer assertions (user choice). Deleted the SVG-specific tests (`svg.test.ts`, `sink-parity.test.ts`, `text.test.ts` — the last tested deferred Text rendering). Rewrote `group`/`camera`/`tilt`/`shapes`/`frame-metadata` to render through the ThorVG renderer and assert pixels (placement, depth-order via overlap, tilt trapezoid, visibility, background). Added `test/support/framebuffer.ts` (render→pixel-query helper).

## 7. Verify

- [x] 7.1 `pnpm --filter effect-motion test` passes (213/213, 22 files); `tsc --noEmit` on motion clean
- [x] 7.2 Demo renders the mid frame end-to-end under the Node adapter → PNG (500×300, decoded: real anti-aliased shapes at correct colors); tilted-plane trapezoid confirmed by `tilt.test.ts`
- [ ] 7.3 `pnpm build` — motion + thorvg build; react/docs are the deferred 6.2/6.3 and will not build until rewired
