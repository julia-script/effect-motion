# ThorVG Single Renderer

## Why

effect-motion's render side is built for *pluggable sinks*: `Renderer.make<Out, Cfg>()` is a generic factory, every shape registers a render function per `(sink × entity)` context key, and there are two SVG sinks (`SvgRenderer` string, `SvgDomRenderer` live DOM) sharing that machinery through a double-registration layer. That pluggability was speculative — the project has decided to render exclusively through ThorVG (`packages/thorvg`), which rasterises to a pixel framebuffer in both Node and browser. One target does not need a generic sink registry, a vnode indirection (`SvgNode`), or a string-vs-DOM split.

Collapsing to a single ThorVG renderer removes the whole plug layer, deletes `packages/motion/src/svg/`, and turns the Node/browser difference from "two renderers" into "one renderer, two tiny output adapters" (`canvas.render()` → PNG buffer in Node, → blit onto `<canvas>` in the browser). The frame-production side (`Scene.run`/`stream`/`play`, Runner, Phaser, Projection) is untouched — it already only emits `Frame` objects and never references a sink.

`packages/thorvg` stays exactly what it is: a bindings-only C-API wrapper with no knowledge of Frames, entities, or projection. All new renderer code lives in `packages/motion` and *consumes* `@effect-motion/thorvg` (already a workspace dependency).

## What Changes

- **Delete the pluggable-sink layer.** Remove `packages/motion/src/svg/` entirely (`SvgRenderer`, `SvgDomRenderer`, `SvgNode`, `shapes.ts`, `project.ts`, `layers.ts`, `SvgNode.ts`, `index.ts`). Drop the generic `Renderer.make<Out, Cfg>()` factory and its per-`(sink × entity)` context registry (`makeEntityRendererContext`/`Service`/`Layer`, `getEntityRenderer`). Remove the `Svg` re-export from `packages/motion/src/index.ts`.

- **Keep the render *pipeline*, de-genericised.** The flatten → world-transform → project → depth-sort logic inside `Renderer.make` is sink-agnostic and stays. It becomes a single non-generic renderer that walks a `Frame`, builds the depth-sorted paintable draw-list (reusing `Projection.project`/`projectQuad`/`planeCorners`/`billboardAffine` unchanged), and hands each paintable to a paint step. Visibility skipping, container flattening, cycle/duplicate defects, and stable id tie-break sort are preserved verbatim.

- **Direct-paint entity contract.** Replace `RenderFunction<SvgNode, Ent>` with a `PaintFunction<Ent>` that issues ThorVG C-API calls (via the `@effect-motion/thorvg` `api.ts` surface: `makeShape`, `appendRect`/`appendCircle`/`moveTo`/…, `setFillColor`, `translate`/`rotate`/`scale`/`setOpacity`, `addToCanvas`/`addToScene`) directly against the shared canvas + scene from the `Thorvg` service. No intermediate description type. Each built-in shape (Circle, Rect, Square, Ellipse, Line, Path, Text, Group) and ParticleField gets one paint function. Paint functions carry `Thorvg` in their requirement channel.

- **Projection applied as ThorVG transforms.** A billboard paintable's `screen` affine is applied via `_tvg_paint_transform` (or the translate/rotate/scale decomposition already exposed); a tilted plane (projection carries a `quad`) is painted as an exact 4-point path (`moveTo` + `lineTo`×3 + `close`) from its projected corners — the ThorVG equivalent of today's `<polygon>`. Culling behind the camera (`scale <= 0`) is preserved.

- **Two output adapters, not two renderers.** After the draw-list is painted and `canvas.draw()`/`sync()` run, one adapter reads the framebuffer: Node → PNG buffer via the existing `encodePng` (`packages/thorvg/src/png.ts`); browser → blit the RGBA buffer onto a target `HTMLCanvasElement`. Both share the entire paint path; they differ only in the final read.

- **Rewire consumers.** `packages/motion/src/demo.ts` and the docs examples/pages that reference `Svg`/`shapesLayer`/`SvgDomRenderer` move to the ThorVG renderer + its provided layer. `@effect-motion/react`'s `usePlayer`/`Player` (which consume `Scene.stream` frames) switch their sink to the browser blit adapter.

## Capabilities

### New Capabilities

- `motion-renderer`: the single ThorVG-backed frame renderer — the de-genericised flatten/project/depth-sort pipeline, the direct-paint entity contract, projection-as-ThorVG-transform, and the Node/browser output adapters.

### Modified Capabilities

<!-- The prior SVG sink behavior was never captured as its own spec capability; it is removed as implementation, not as a spec delta. -->

## Impact

- `packages/motion/src/`: delete `svg/` (8 files). Rewrite `Renderer.ts` from a generic factory to one concrete ThorVG renderer (pipeline retained). Add the per-entity paint functions and the two output adapters (Node PNG / browser blit). Update `index.ts` (drop `Svg`, export the renderer + adapters). Update `demo.ts`.
- `packages/thorvg`: **unchanged** — bindings-only. Consumed, not modified. `encodePng` is already exported.
- `packages/react/src/`: `usePlayer`/`Player` switch to the browser blit adapter.
- `apps/docs`: `rendering.mdx`, `custom-entities.mdx`, `react-player.mdx` and any `*.scene.ts` examples referencing `Svg` are updated to the ThorVG renderer; the SVG-specific narrative in `rendering.mdx` is rewritten for the single-renderer model.
- **Determinism:** paint order is still the depth-sorted draw-list with stable id tie-break, so frames are reproducible. ThorVG's SW rasteriser is deterministic given identical draw calls; the seeded `Random` service and frame-exact landing are unaffected (they live on the Scene side).
- **Deferred (`ponytail:`), not in scope:** keyed reconciliation / dirty-frame diffing on the browser blit path (today: full repaint per frame, mirroring the old clear-and-rebuild ceiling); a WebGL/WGPU ThorVG canvas backend (SW only for now); font/text glyph loading beyond what the existing `Fonts` surface provides.
