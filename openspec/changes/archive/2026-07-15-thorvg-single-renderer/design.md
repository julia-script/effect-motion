# Design: ThorVG Single Renderer

## Context

effect-motion cleanly splits into a **frame-production** side (`Scene.run`/`stream`/`play`, `Runner`, `Phaser`, `Projection`, `Camera`) that emits `Frame` objects, and a **render** side that folds a `Frame` into output. The render side was built for pluggable sinks — a generic `Renderer.make<Out, Cfg>()` factory, a per-`(sink × entity)` context-keyed registry of render functions, and two SVG sinks (`SvgRenderer` string, `SvgDomRenderer` DOM) sharing it via a double-registration layer and an `SvgNode` vnode indirection. The project now renders exclusively through ThorVG, which rasterises to a pixel framebuffer in both Node and browser. This change collapses the render side to one ThorVG renderer and deletes the plug layer, without touching the frame-production side.

`packages/thorvg` is bindings-only (C-API wrapper, no Frame/entity/projection knowledge). The renderer lives in `packages/motion` and consumes `@effect-motion/thorvg`.

## What is kept vs. deleted

```
   Renderer.make<Out, Cfg>()                     DELETE the factory + registry
     ├─ generic type params (Out, Cfg)     ──▶   gone: one concrete Out (framebuffer)
     ├─ makeEntityRendererContext/Service/Layer   gone: no per-(sink×entity) keys
     ├─ getEntityRenderer (context lookup)   ──▶  gone: paint fns resolved by a plain
     │                                             entity→paint map
     ├─ flatten (tree → draw-list)           ──▶  KEEP verbatim
     ├─ world-transform composition          ──▶  KEEP verbatim
     ├─ Projection.project / projectQuad     ──▶  KEEP (unchanged Projection.ts)
     ├─ billboardAffine / planeCorners       ──▶  KEEP
     ├─ visibility skip, cycle/dup defects   ──▶  KEEP verbatim
     └─ depth sort + stable id tie-break     ──▶  KEEP verbatim

   svg/ (SvgRenderer, SvgDomRenderer,              DELETE ALL (8 files)
         SvgNode, shapes, project, layers)
```

The pipeline (flatten/project/sort) is sink-agnostic and is the valuable part; the pluggability (generics, registry, vnode) is the speculative part being removed.

## Goals / Non-Goals

**Goals:**
- One ThorVG-backed renderer; no generic sink factory, no `(sink × entity)` registry, no `SvgNode`.
- Preserve the frame pipeline exactly: same flatten, same projection math, same depth-sorted deterministic draw order.
- Direct-paint entity contract: entities issue ThorVG calls, no intermediate description type.
- Node and browser share the entire paint path; only the final framebuffer read differs (PNG buffer vs. `<canvas>` blit).
- `packages/thorvg` stays bindings-only — the only permitted change there is *adding* thin wrappers for C-API functions the renderer needs that aren't wrapped yet (see D5).

**Non-Goals:**
- Any change to `Scene`/`Runner`/`Phaser`/`Projection`/`Camera` (frame production).
- Keyed reconciliation / dirty-frame diffing (deferred; full repaint per frame for now).
- GL/WGPU ThorVG backends (SW canvas only).
- New shape types or trait semantics.

## Decisions

### D1: One concrete renderer, pipeline retained

`Renderer.ts` becomes a single function `render(frame, canvas, scene): Effect<void, ThorvgException, Thorvg>` (name TBD in impl). It runs the *existing* flatten/world-offset/project/quad/depth-sort logic to produce the `Paintable[]` draw-list, then iterates far→near calling each paintable's paint function. The generic `make<Out, Cfg>()`, `makeEntityRenderer*`, and `getEntityRenderer` are removed. Paint functions are resolved by a plain `entity → PaintFunction` lookup (a `Map`/record keyed by `entity.name`), not a Context service per key — there is one target, so a context registry buys nothing.

### D2: Direct-paint entity contract

```
type PaintFunction<Ent> = (payload: {
  entity: Ent; id: string; data: Ent["data"]["Type"];
  projection: PaintProjection;         // screen affine, depth, scale, optional quad
  canvas: Canvas; scene: OwnedPaint;   // shared ThorVG targets for this frame
}) => Effect.Effect<void, ThorvgException, Thorvg | Scope.Scope>
```

Each built-in gets one: e.g. `Circle` → `makeShape` → `appendCircle(x,y,r,r)` → `setFillColor(...)` → apply projection (D3) → `addToScene`. `Group` paints nothing itself (its position already composed into children's world coords by flatten, exactly as today). `ParticleField` iterates its particles into one shape. Paint functions carry `Thorvg` in `R`, resolved once per frame from the service. No `SvgNode`, no vnode interpretation step.

The old "coverage manifest" property (a built-in not registered is a *type* error, not a runtime surprise) is preserved by making the entity→paint map exhaustive over the built-in union at the type level.

### D3: Projection applied as a ThorVG transform

A billboard paintable carries `projection.screen` — a 2D affine `{a,b,c,d,e,f}`. ThorVG paints take a full transform via `_tvg_paint_set_transform(paint, matrixPtr)`, where the matrix is a `Tvg_Matrix` (3×3 row-major floats: `e11 e12 e13 / e21 e22 e23 / e31 e32 e33`). The affine maps as:
```
e11=a  e12=c  e13=e
e21=b  e22=d  e23=f
e31=0  e32=0  e33=1
```
The identity fast-path (resting camera, z=0) is kept: when the affine is identity, skip the transform call entirely, so plain-2D scenes issue the minimal draw calls (mirrors the old `wrapProjected` identity skip).

A **tilted plane** (projection carries `quad` — four projected screen corners) is painted as an exact path: `moveTo(q0)`, `lineTo(q1)`, `lineTo(q2)`, `lineTo(q3)`, `close`, filled with the shape's style. This replaces the old `<polygon>` and is perspective-correct for the same reason (corners projected individually). Behind-camera culling (`projection.scale <= 0`) skips the paint, mirroring `wrapProjected` returning `null`.

### D4: Two output adapters, one paint path

After the draw-list is painted onto the shared canvas, `canvas.update()` / `draw()` / `sync()` run once (existing `api.ts` surface). Then:
- **Node adapter:** read the SW framebuffer (`canvas.instance.render()` yields the buffer; the design-verified Embind `TvgCanvas` exposes it) → `encodePng(rgba, w, h)` (already exported from `packages/thorvg`). Returns a PNG `Uint8Array`.
- **Browser adapter:** take the RGBA buffer and blit onto a target `HTMLCanvasElement` via `ctx.putImageData(new ImageData(clamped, w, h), 0, 0)`.

Both are ~5–10 lines and share 100% of the paint path. This is the core simplification: the Node/browser split is now "same renderer, different final read," not "two renderers."

### D5: The one permitted `packages/thorvg` addition — `setTransform`

`api.ts` today wraps `translate`/`rotate`/`scale`/`setOpacity` (scalar paint ops) but **not** `_tvg_paint_set_transform` (full matrix), which D3 needs to apply an arbitrary billboard affine. This change adds one wrapper to `packages/thorvg/src/api.ts`:
```
setTransform(paint, { a,b,c,d,e,f }) =
  withScratch(36)(s => { s.writeF32(0,a); s.writeF32(4,c); s.writeF32(8,e);
                         s.writeF32(12,b); s.writeF32(16,d); s.writeF32(20,f);
                         s.writeF32(24,0); s.writeF32(28,0); s.writeF32(32,1);
                         checked("_tvg_paint_set_transform", () =>
                           module._tvg_paint_set_transform(paint.ptr, s.ptr)) })
```
This is a mechanical addition consistent with the existing wrappers (design of `thorvg-effect-api` D4 `withScratch`), not a change to the package's role. It keeps thorvg bindings-only: a wrapper for an already-typed C-API function, no Frame/entity knowledge. `_tvg_paint_set_transform` is present in `thorvgemscripten.ts:84`.

### D6: Consumer rewiring

- `demo.ts`: swap `shapesLayer` + `Svg` for the ThorVG renderer + Node PNG adapter (or browser blit under the docs player).
- `@effect-motion/react` (`usePlayer`/`Player`): they consume `Scene.stream` frames and currently push into an SVG DOM sink; switch to the browser blit adapter against a `<canvas>` the `Player` owns. Frame production is unchanged, so the streaming/rAF buffering logic is untouched.
- `apps/docs`: `rendering.mdx` rewritten for the single-renderer model (remove the SvgRenderer-vs-SvgDomRenderer framing); `custom-entities.mdx` updated to show a `PaintFunction` instead of an `SvgNode` render fn; example `*.scene.ts` referencing `Svg` updated.

## Risks

- **Framebuffer read shape.** The Node PNG path depends on `TvgCanvas.render()`/the SW buffer layout being RGBA8888 premultiplied or straight — must be verified against a one-rect smoke (draw red rect, assert center pixel) before wiring adapters. Mitigation: the `thorvg-effect-api` smoke already draws one rect to a buffer; extend it to assert pixel color.
- **Transform vs. translate composition.** Applying `set_transform` overwrites any prior `translate`/`rotate`/`scale` on the same paint (they compose into ThorVG's single transform). Paint functions must apply projection *last* (or fold local geometry into the affine), matching how `wrapProjected` wrapped the whole node. Mitigation: paint functions build geometry in local coords, then apply the single projection transform — never mix scalar ops with `setTransform` on one paint.
- **React SSR / canvas availability.** The browser blit adapter needs an `HTMLCanvasElement`; guard for non-DOM environments the same way the old DOM sink did.
- **Docs churn.** SVG is woven through three docs pages; incomplete rewrite leaves dead `Svg` references. Mitigation: grep for `Svg`/`SvgNode`/`shapesLayer` in `apps/docs` as a tasks checkbox.

## Migration

No external consumers (pre-release). Internal consumers (`demo.ts`, react package, docs) are migrated in this change. The SVG sink behavior was never captured as an openspec spec capability, so there is no spec delta to remove — it is deleted as implementation. `Renderer` is re-exported from `packages/motion`; its public surface changes from the generic `make` factory to the concrete renderer + adapters, which is a breaking API change acceptable pre-release.
