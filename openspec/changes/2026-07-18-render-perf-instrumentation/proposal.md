# Render performance: phase instrumentation + benchmark harness, and an improvement plan

## Why

2.5D scenes look great but can drop frames, and there is no way to see *where*
the per-frame time goes — the report "rotating the camera makes it slow" has no
instrument behind it. Before optimizing anything we need (a) a repeatable way to
measure render cost and attribute it to a phase, and (b) a plan grounded in real
numbers rather than guesses.

Measuring first already corrected a wrong guess: **camera rotation is not the
cost.** On identical geometry a rotated camera renders as fast as (often faster
than) a resting one — the projection trig is negligible. What actually moves the
number is how a pose changes on-screen coverage, plus the resolution the player
rasterizes at. The instrument is what let us see that.

## What Changes

- **Two tracing spans in `Renderer.render`** split each frame along its real
  seam, using Effect's own tracing primitive (`Effect.withSpan`) so the split
  composes with any observability backend and costs nothing in normal playback
  (a no-op span when no tracer is installed):
  - `Renderer.compose` — the JS pipeline: flatten the instance tree, project
    every paintable through the camera, depth-sort, and issue the ThorVG paint
    calls. **Scales with object count.** Carries `object_count` as an attribute.
  - `Renderer.raster` — ThorVG's software rasterizer filling pixels. **Scales
    with covered pixels × dpr² and with depth-of-field blur buckets.** Carries
    `width`/`height`/`dpr`.
  - A parent `Renderer.render` span wraps the whole frame.
- **A benchmark harness** (`packages/motion/bench/render-bench.ts`, `pnpm bench`)
  that renders representative scenes headlessly through the ThorVG SW engine and
  reports per-frame wall time (mean/p95/fps) plus the compose/raster breakdown,
  read off the spans via a small collecting tracer. Scene matrix: object-count
  sweep, camera-rotation-on-identical-geometry, coverage (large planes), a dpr
  sweep, and a depth-of-field sweep — one axis per known cost driver.
- **A measured cost model and a ranked improvement plan** recorded in `design.md`
  — the deliverable that turns "it's slow" into an ordered backlog, each item
  paired with the bench scenario that will confirm or kill it.

This change ships the *measurement* (spans + bench + documented model). The
optimizations it identifies are follow-up changes; their tasks are listed here
as the backlog, unchecked.

## Capabilities

### New Capabilities

- `render-performance`: the render-phase tracing spans and the benchmark
  harness — the contract that per-frame cost is observable as `Renderer.compose`
  / `Renderer.raster` / `Renderer.render` spans, and that a runnable bench
  reports them.

## Impact

- `packages/motion`: `Renderer.ts` (three `withSpan` wrappers, no behavior
  change), new `bench/render-bench.ts`, a `bench` script in `package.json`.
  `bench/` is outside `tsconfig`'s `include` (`src`/`test`), so it does not enter
  `pnpm check` or the published build.
- No dependency changes; `tsx` is already a dev dependency.
- No runtime behavior change: spans are inert without a tracer, and every
  existing test passes unchanged (the 8 pre-existing failures are the
  Effect beta.94→beta.98 Schedule drift, not render).
- Determinism untouched: spans read the clock for their own duration only; they
  never feed frame data.
