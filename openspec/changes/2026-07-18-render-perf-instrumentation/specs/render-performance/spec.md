# render-performance (delta)

## ADDED Requirements

### Requirement: Per-frame render cost is observable by phase
`Renderer.render` SHALL emit Effect tracing spans that split each frame's cost
into a JS "compose" phase (tree flatten, projection, depth sort, and issuing
paint calls) and a "raster" phase (the software rasterizer filling pixels),
nested under a span for the whole frame. The spans SHALL carry attributes
identifying the workload (`object_count` on compose; `width`/`height`/`dpr` on
raster).

#### Scenario: Phases are separately timed
- **WHEN** a frame renders with a tracer installed
- **THEN** a `Renderer.compose` span and a `Renderer.raster` span both complete, nested under a `Renderer.render` span, each with a real duration

#### Scenario: Attributes identify the workload
- **WHEN** the `Renderer.compose` span is recorded
- **THEN** it carries the frame's `object_count`, and the `Renderer.raster` span carries the physical `width`/`height` and `dpr`

### Requirement: Instrumentation is free without a tracer
The phase spans SHALL impose no behavioral cost when no tracer is installed:
rendering the same frame with and without a collecting tracer SHALL produce
identical output, and normal playback (no tracer) SHALL not depend on span
timing.

#### Scenario: Output is unchanged by instrumentation
- **WHEN** a frame renders without any tracer installed
- **THEN** the framebuffer is identical to the pre-instrumentation renderer's output for that frame

#### Scenario: Spans never feed frame data
- **WHEN** a frame renders
- **THEN** span start/end timestamps are used only for the spans' own durations and never influence projected positions, depth order, or any pixel

### Requirement: A benchmark reports render cost across representative scenes
The `packages/motion` package SHALL provide a runnable benchmark (`pnpm bench`)
that renders representative scenes headlessly through the ThorVG software engine
and reports, per scene, the wall-clock per-frame time (mean and a tail
percentile) alongside the compose/raster split read from the phase spans. The
scene matrix SHALL cover each known cost driver: object count, camera rotation
on fixed geometry, on-screen coverage, device-pixel-ratio, and depth-of-field
aperture.

#### Scenario: The bench attributes cost to a phase
- **WHEN** `pnpm bench` runs
- **THEN** each scene line reports a wall-clock time and a compose-vs-raster breakdown, so an increase can be attributed to the JS pipeline or the rasterizer

#### Scenario: Each cost driver has its own axis
- **WHEN** the bench runs
- **THEN** it sweeps object count, camera rotation on identical geometry, coverage, dpr, and aperture as separate scenarios
