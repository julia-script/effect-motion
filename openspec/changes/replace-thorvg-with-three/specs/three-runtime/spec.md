# three-runtime Delta Specification

## ADDED Requirements

### Requirement: Idiomatic-Effect wrapper scoped to actual usage
`@effect-motion/three` SHALL wrap three.js in idiomatic Effect with modules mirroring three's own API names (e.g. `Renderer`, `PostProcessing`, `Line2`), covering only the surface the renderer uses and growing lazily as usage grows. The package SHALL be bindings-only: it knows only three.js and SHALL NOT depend on `effect-motion` or know about frames, entities, or projection (mirroring `@effect-motion/thorvg`'s contract). Effect SHALL live at the seams — construction/disposal, async boundaries, and failures. Per-frame object mutation (positions, materials, the retained diff) SHALL remain synchronous raw three; the wrapper SHALL NOT wrap per-object mutation in Effect.

#### Scenario: Wrapper modules mirror three names
- **WHEN** a consumer imports the wrapper
- **THEN** the modules correspond recognizably to three concepts (a three user can navigate the wrapper by three's own names)

#### Scenario: Bindings-only boundary
- **WHEN** the package's dependencies and imports are inspected
- **THEN** it depends on `three` (and platform shims) but not on `effect-motion`

#### Scenario: Hot path stays synchronous
- **WHEN** the consuming renderer updates a retained object's position and material for a frame
- **THEN** no Effect values are constructed or run per object

### Requirement: Scoped renderer lifecycle with pre-warm
Acquiring a renderer SHALL be a scoped Effect: construction and async initialization (including WebGPU device/pipeline setup) happen on acquire, `dispose` runs on scope close. Initialization SHALL pre-warm render pipelines so the first presented frame does not pay the pipeline-compile cost (~40–80ms observed in the spike).

#### Scenario: Scope close disposes the renderer
- **WHEN** the scope that acquired a renderer closes
- **THEN** the underlying three renderer and its GPU resources are disposed

#### Scenario: First frame is not jank
- **WHEN** a renderer finishes acquisition and renders its first frame
- **THEN** pipeline compilation has already happened during init, not on that frame

### Requirement: Async boundaries are Effects with tagged errors
Renderer initialization, rendering, and pixel readback SHALL be exposed as Effects whose failures surface as tagged errors (never thrown exceptions), so callers compose them with ordinary Effect error handling.

#### Scenario: Init failure is a tagged error
- **WHEN** WebGPU is unavailable in the environment
- **THEN** renderer acquisition fails with a tagged error describing the cause, not an unhandled rejection

### Requirement: Node entry renders on a real GPU without a browser
A dedicated `/node` subpath SHALL provide the Node runtime: a Dawn-backed WebGPU device (via the `webgpu` npm bindings), requested at core feature level and passed to the renderer (three's own `featureLevel: 'compatibility'` request is bypassed so MSAA etc. are available), plus the required environment shims (`navigator` via `defineProperty` on Node ≥ 24, `requestAnimationFrame`, `self`) and a stub canvas/context. The default (`.`) entry SHALL remain browser-safe: no `node:*` imports reachable from it.

#### Scenario: Headless render in plain Node
- **WHEN** a Node program acquires a renderer through the `/node` entry and renders a frame to a render target with readback
- **THEN** it produces correct pixels without puppeteer or a browser, at parity with the browser output (world-unit strokes, MSAA, dpr)

#### Scenario: Browser bundle excludes Node code
- **WHEN** a bundler builds from the default entry for the browser
- **THEN** no module importing a `node:*` built-in or the Dawn bindings is included

### Requirement: Readback produces display-ready pixels
Pixel readback for export SHALL yield tightly-packed, top-down, sRGB-encoded RGBA rows: the implementation SHALL destride WebGPU's 256-byte row alignment and SHALL render through the post-processing pipeline (which applies the sRGB output transform) rather than reading a raw linear render target.

#### Scenario: Readback bytes encode directly to PNG
- **WHEN** a frame is read back and PNG-encoded with no further conversion
- **THEN** the PNG matches what the browser presents for the same frame (same orientation, same colors)
