# Proposal: replace-thorvg-with-three

## Why

The threejs-renderer-spike (archived change `2026-07-19-threejs-renderer-spike`) confirmed that a three.js WebGPU renderer reproduces the ThorVG camera model exactly, renders 2D and 2.5D scenes at ~4–8× the steady-state speed with per-pixel depth of field and perspective-correct strokes, and runs headless in plain Node via Dawn (`webgpu` npm) without puppeteer. Quality and performance both favor a full replacement — a single renderer, not a second sink. ThorVG is retired entirely.

## What Changes

- **BREAKING** Two new packages replacing the ThorVG stack in a three-layer split: `@effect-motion/three`, a bindings-only idiomatic-Effect wrapper over three.js (mirroring three's own API names, covering only what we use, grown lazily; knows nothing about frames or entities; browser entry plus `/node` Dawn entry), and `@effect-motion/renderer`, the retained frame renderer — the only place frames meet three — consumed by player, export, and CLI.
- **BREAKING** Core goes renderer-free: `Renderer.ts`, `render/` (shapes, paint, CPU DoF), the render error channel, and the `@effect-motion/thorvg` dependency are deleted from `effect-motion`. The frame stream (+ `Color`, camera resolution) is core's renderer-facing contract; no renderer dependency remains in core's tree.
- **BREAKING** `packages/thorvg` is deleted; `@effect-motion/thorvg` is no longer published.
- **BREAKING** The entity render contract changes from immediate-mode `PaintFunction`s to a retained `build`/`update`/`dispose` contract in `@effect-motion/renderer` (built-in coverage stays a type-level guarantee; custom entities register with the renderer package).
- **BREAKING** Stroke semantics become perspective-correct world-unit widths (a port motivation, not a regression); depth handling moves from painter's-order sorting to the GPU z-buffer (with `renderOrder` for coplanar translucent stacks); DoF becomes per-pixel GPU post-processing.
- **BREAKING** The camera model is redefined in whatever terms are convenient for three (fov/near/far etc.), keeping scene space y-down/top-left with the z=0 identity invariant and the AE-style focal-length default. Core adapts to the renderer, not vice versa.
- Text renders via SDF (troika-three-text) with real `Font` resource resolution — replacing ThorVG text rasterization.
- `@effect-motion/react` player and `@effect-motion/export` video pipeline are rewired to `@effect-motion/three` (GPU readback → PNG → ffmpeg; renderer pre-warm for the first-frame pipeline compile).
- Determinism invariant clarified (already recorded in AGENTS.md): determinism stops at the frame stream; pixel-level output equality is explicitly not a goal.

## Capabilities

### New Capabilities

- `three-runtime`: the bindings-only Effect wrapper over three.js in `@effect-motion/three` — scoped renderer lifecycle (init/dispose), async boundaries (init, render, readback) as Effects, typed errors, browser WebGPU acquisition, and the Node entry (Dawn device, `navigator`/rAF/`self` shims, core-feature device workaround). No dependency on `effect-motion`.
- `three-text`: SDF text rendering with embedded-default and custom `Font` resource fidelity, anchor/baseline semantics, and perspective scaling.

### Modified Capabilities

- `camera-3d`: camera model redefined in three-native terms; identity invariant and AE focal-length default preserved.
- `depth-of-field`: CoC-bucket CPU blur replaced by per-pixel GPU DoF; aperture-0-is-a-no-op preserved; the Dawn/TSL DoF bug gates DoF on the export path (workaround or upstream fix tracked in design).
- `depth-render-order`: painter's-order draw list replaced by z-buffer + deterministic `renderOrder` tie-break.
- `react-player`: ThorVG engine/wasm provisioning replaced by `@effect-motion/three` renderer lifecycle (incl. pre-warm).
- `video-encoding`: frame source becomes GPU render-target readback (sRGB, row-alignment destride) instead of `renderToPng`.
- `motion-renderer`: rewritten — still the single frame renderer, now three-backed, retained, and living in `@effect-motion/renderer` instead of core: the retained scene graph replaces the flatten/project/depth-sort CPU pipeline, `build`/`update`/`dispose` replaces direct paint, GPU projection replaces ThorVG transforms, world-unit strokes, billboard semantics, comps via render targets.
- `thorvg-runtime`, `thorvg-fonts`, `thorvg-images`, `thorvg-text`: **removed** with the package.
- `image-assets`: image loading/paint retargeted from ThorVG pictures to three textures (decode-once per renderer scope).
- `projection`: CPU projection shrinks to camera resolution; per-point/quad screen projection dissolves into the GPU path.

(`font-loading` and `package-distribution` are touched by implementation but their requirements are renderer-agnostic and unchanged — no deltas.)

## Impact

- **Packages**: new `packages/three` (bindings-only) and `packages/renderer` (retained frame renderer); deleted `packages/thorvg`; `packages/motion` loses ~1,400 lines of render code and every renderer dependency; `packages/react`, `packages/export`, `packages/cli` (render command), and `apps/docs` rewire to `@effect-motion/renderer`.
- **Dependencies**: adds `three` (spike used 0.185.1) and `webgpu` (Dawn bindings, Node); removes `@thorvg/webcanvas`.
- **Sequencing**: staged, each stage shippable — (1) `@effect-motion/three` wrapper + `@effect-motion/renderer` packages alongside the untouched ThorVG stack, player side-by-side verifiable; (2) Node path + export rewire; (3) delete ThorVG package and core's render layer (point of no return); (4) SDF text; (5) comps + remaining shapes (images, Hud, group transforms, rounded rects, path fills, particles).
- **Known risks** (from spike findings): TSL DoF broken under Dawn (upstream bug — export ships without DoF until worked around); first-frame pipeline-compile jank needs pre-warm; DoF bokeh sampling noise on thin translucent lines; WebGL2 fallback untested.
