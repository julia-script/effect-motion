# Tasks: render-perf-instrumentation

## 1. Phase spans in the renderer (shipped)

- [x] 1.1 `Renderer.render`: wrap `renderToCanvas` in `Effect.withSpan("Renderer.compose", { attributes: { object_count } })`; wrap `Canvas.update/draw/sync` in `Effect.withSpan("Renderer.raster", { attributes: { width, height, dpr } })`; wrap the whole frame in `Effect.withSpan("Renderer.render")`. No behavior change — spans are no-ops without a tracer.
- [x] 1.2 Confirm no regression: render/tilt/camera/depth-of-field/shapes/play tests pass unchanged; the split is verified by the bench's collecting tracer producing non-zero compose/raster durations.

## 2. Benchmark harness (shipped)

- [x] 2.1 `packages/motion/bench/render-bench.ts`: a `PhaseCollector` tracer that records span durations by name; `Effect.timed` for the wall-clock envelope; `stat()` for mean/p50/p95.
- [x] 2.2 Scene matrix, one axis per cost driver: object-count sweep, camera-rotation-on-identical-geometry, coverage (large planes), dpr sweep, depth-of-field sweep.
- [x] 2.3 `pnpm bench` script in `packages/motion/package.json` (uses the existing `tsx` dev dependency). `bench/` stays outside `tsconfig` `include`, so it never enters `pnpm check` or the published build.
- [x] 2.4 Record the measured cost model in `design.md` D3 and the ranked plan in D4.

## 3. Follow-up optimizations (backlog — each its own change, measured against the bench)

- [ ] 3.1 Player raster-resolution cap / quality setting (design D4.1) — biggest playback win; validate on the dpr sweep.
- [ ] 3.2 Retained ThorVG scene graph — update transforms/dirty props instead of rebuilding every frame (design D4.2); `ponytail:` the per-frame `Tvg.Scene.make()` site; validate on the object-count sweep.
- [ ] 3.3 Viewport culling for billboards and tilted planes, matching the Line clip (design D4.3); add an offscreen-pan bench scene.
- [ ] 3.4 Iterative `flatten` — drop per-node `Effect.gen`/`Effect.all` allocation (design D4.4); validate on deep-Group fan-out.
- [ ] 3.5 Precompute the camera inverse-rotation basis once per frame in `Projection` (design D4.5); validate on the rotation sweep.
- [ ] 3.6 Cheaper depth-of-field (blur quality / downsampled buckets / bucket cap) (design D4.6); validate on the aperture sweep.

## 4. Wrap up (shipped scope)

- [x] 4.1 `pnpm lint:fix` on the changed/new files; bench runs green via `pnpm bench`.
- [x] 4.2 Roadmap pointer to this change under a Performance note.
