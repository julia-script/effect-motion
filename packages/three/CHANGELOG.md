# @effect-motion/three

## 1.0.0

### Patch Changes

- 47b4de0: Scenes now default to paint compositing: later children paint over earlier children,
  including coplanar fills, borders and text. Set `compositing: "depth"` in Scene.make
  metadata to preserve physical 3D occlusion. Frames and Scene.play mounts carry the
  mode explicitly.

  Groups can opt into `compositing: "paint"` to form a flat surface inside a depth
  scene. Bounds follow the contents, transforms and opacity apply once to the surface,
  and transparent holes do not occlude the background. Ordinary groups inherit their
  context. Retained ordering updates when siblings reorder, and removed composition
  resources are now disposed correctly.

- 47b4de0: Planar strokes now composite opacity once across joins, closure, self-crossings,
  retracing and all subpaths of one Path. Separate entities still blend separately.
  A retained multisample occupancy mask preserves transparent holes and reuses
  coverage through color and opacity fades. Nonplanar 3D strokes retain per-point depth.
- 47b4de0: Preserve thin-stroke coverage with retained supersampled occupancy masks and
  mip-filtered reduction. Paint surfaces now use the same four-sample policy as the
  final scene. Target density follows viewport scale, local depth and projected
  magnification while authored fractional widths and positions stay unchanged.

  The Player now requests native device pixel ratio. CSS may still scale its finished
  canvas; the border lab includes native-size width/offset/orientation controls.

## 0.8.0

### Minor Changes

- 340724d: Add animatable alpha and inverse masks to scene authoring and shared browser/Node rendering. An existing shape, text, image, or group supplies coverage for a drawable target, including partial transparency and nested masks. Add a guide and runnable reveal, inverse cutout, and partial-alpha examples.

## 0.7.0

## 0.6.0

## 0.5.0

### Minor Changes

- 31d0718: The renderer is three.js/WebGPU; ThorVG is retired.

  **BREAKING (pre-1.0 minor):** `@effect-motion/thorvg` is deleted and no longer published. Two packages replace it: `@effect-motion/three`, a bindings-only Effect wrapper over three.js (browser entry plus a `/node` entry that installs Dawn-backed WebGPU and the environment shims three needs), and `@effect-motion/renderer`, the retained frame renderer — the only place frames meet three — with a browser canvas adapter and a headless Node PNG adapter, consumed by the player and export.

  Core goes renderer-free: `Renderer.ts`, `render/` (shapes, paint, CPU depth-of-field), and the render error channel are deleted from `effect-motion`; the frame stream (plus `Color` and camera resolution in `Projection.ts`) is core's renderer-facing contract, and no renderer dependency remains in its tree.

  Rendering semantics change with the backend: the entity render contract is retained `build`/`update`/`dispose` (replacing immediate-mode paint functions); strokes are perspective-correct world-unit widths; occlusion is the GPU z-buffer (deterministic `renderOrder` breaks coplanar ties) instead of painter's-order sorting; depth of field is per-pixel GPU post-processing, still bypassed at aperture 0; text renders as SDF glyphs (troika-three-text) with real `Font` resource resolution. The camera model is redefined in three-native terms, preserving the y-down/top-left scene space, the z=0 identity invariant, and the AE-style focal-length default.

  `@effect-motion/react`'s Player and `@effect-motion/export`'s pipeline are rewired to the new renderer (GPU render-target readback → PNG → ffmpeg; the player pre-warms the renderer to absorb the first-frame pipeline compile). Determinism is clarified as stopping at the frame stream: same seed + settings → same frames; pixel-identical rendered output across backends is explicitly not a goal.
