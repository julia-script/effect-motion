---
"effect-motion": minor
"@effect-motion/react": minor
"@effect-motion/export": minor
"@effect-motion/three": minor
"@effect-motion/renderer": minor
---

The renderer is three.js/WebGPU; ThorVG is retired.

**BREAKING (pre-1.0 minor):** `@effect-motion/thorvg` is deleted and no longer published. Two packages replace it: `@effect-motion/three`, a bindings-only Effect wrapper over three.js (browser entry plus a `/node` entry that installs Dawn-backed WebGPU and the environment shims three needs), and `@effect-motion/renderer`, the retained frame renderer — the only place frames meet three — with a browser canvas adapter and a headless Node PNG adapter, consumed by the player and export.

Core goes renderer-free: `Renderer.ts`, `render/` (shapes, paint, CPU depth-of-field), and the render error channel are deleted from `effect-motion`; the frame stream (plus `Color` and camera resolution in `Projection.ts`) is core's renderer-facing contract, and no renderer dependency remains in its tree.

Rendering semantics change with the backend: the entity render contract is retained `build`/`update`/`dispose` (replacing immediate-mode paint functions); strokes are perspective-correct world-unit widths; occlusion is the GPU z-buffer (deterministic `renderOrder` breaks coplanar ties) instead of painter's-order sorting; depth of field is per-pixel GPU post-processing, still bypassed at aperture 0; text renders as SDF glyphs (troika-three-text) with real `Font` resource resolution. The camera model is redefined in three-native terms, preserving the y-down/top-left scene space, the z=0 identity invariant, and the AE-style focal-length default.

`@effect-motion/react`'s Player and `@effect-motion/export`'s pipeline are rewired to the new renderer (GPU render-target readback → PNG → ffmpeg; the player pre-warms the renderer to absorb the first-frame pipeline compile). Determinism is clarified as stopping at the frame stream: same seed + settings → same frames; pixel-identical rendered output across backends is explicitly not a goal.
