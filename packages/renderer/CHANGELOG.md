# @effect-motion/renderer

## 0.6.0

### Minor Changes

- e42463d: Replace the hand-rolled text pipeline (troika typesetting + webgl-sdf-generator
  - a fixed 256-glyph atlas and hand-built two-pass material) with
    `@text-rendering-toolkit`: real HarfBuzz shaping, a growable glyph atlas, and
    the toolkit's depth-ink glyph mesh. Rendering semantics are preserved — SDF
    crispness, anchor/baseline behavior, exactly-once ink blending at partial
    opacity, z-buffer occlusion, and the loud missing-font defect. The fixed atlas
    capacity (and its overflow error) is gone. Note: the font engine ships ~390 KB
    of HarfBuzz WASM resolved via `import.meta.url`; bundlers must handle a `.wasm`
    asset reference (Node and Vite/Next work out of the box).

### Patch Changes

- effect-motion@0.6.0
- @effect-motion/three@0.6.0

## 0.5.0

### Minor Changes

- bdac91f: Scene space is now center-origin and y-up, and shapes anchor at their center.

  **BREAKING (pre-1.0 minor):** the authoring frame changes from y-down/top-left (the SVG convention) to **x right, y up, origin at the viewport center, +z toward the viewer** — a right-handed frame, like Manim and Motion Canvas. Every coordinate in every scene changes meaning:

  - `(0, 0)` is the middle of the frame; the visible extent at z=0 is x ∈ [−width/2, width/2], y ∈ [−height/2, height/2]. Migrate positions with `x' = x − width/2`, `y' = height/2 − y`.
  - Positive `rotation.z` now reads **counterclockwise** on screen; migrate visual rotations with `rotX' = −rotX`, `rotZ' = −rotZ` (`rotY` unchanged).
  - **Rect, Square, and Image are center-anchored**: `position` is the shape's center and rotation is about it (Circle/Ellipse already were; Text keeps its typographic `textAnchor`/`baseline` semantics; Line/Path are point-defined).
  - The camera's `x`/`y` are plain world coordinates (the resting camera sits at `(0, 0)`), and `Projection.project`/`toView`/`resolveCamera` lost their `origin` parameter — with a center origin it was always zero.
  - `Scene.play` mounts center in the enclosing comp at `(0, 0)` by construction; the composite plane is center-anchored like an Image.
  - Particles: positive `gravity` still pulls toward the bottom of the screen; launch `angle: 0` still means straight up, but positive angles are now counterclockwise; a fill field's region is centered on the field's position. The RNG draw sequence is unchanged, so seeded streams are stable.

  The renderer's scene→three mapping is now the identity (three is y-up/center-origin natively); y-flips survive only at genuinely y-down boundaries (font metrics, texture row order, pixel readback).

- 31d0718: The entity world is closed: a tagged union and a uniform transform replace open generics and traits.

  **BREAKING (pre-1.0 minor):** `Entity` is now a closed `Schema.TaggedUnion` over the ten known entities (`Line`, `Path`, `Rect`, `Circle`, `Ellipse`, `Text`, `Group`, `Hud`, `Image`, `Camera`); entity identity is `_tag`. The open-world machinery is removed: `Entity<Name, Data, Traits>`, `Entity.make`, `AnyEntity`, `EntityData`, `isEntity`, and the entire trait system (`TraitLens`, `EntityTraits`, `PartialTraits`, `TraitKey`, `traitOrDie`, `~position`, `~opacity`, `positionLens`/`opacityLens`, every per-entity lens). Semantic animators (`move`/`moveTo`, `fade`/`fadeTo`, `spring`/`springTo`) target schema fields directly and are compile-time gated by `_tag` narrowing — fading an entity without `opacity` is a type error naming the missing field.

  Every entity carries a uniform transform: `position: Vec3`, `rotation: Vec3`, `scale: Vec3`. Flat `x`/`y`/`z` fields and `Rect`'s `rotX`/`rotY`/`rotZ` are subsumed; `Line`'s `start`/`end` become `Vec3` offsets **relative to** its `position` (`x2`/`y2`/`z2` removed), so animating `position` translates any shape rigidly with no per-entity compensation. `Group`'s unused 2D affine DSL (`TransformMatrix`, `TransformOperation`, `identityTransform`, `multiplyTransforms`) is deleted; groups compose the same TRS transform as everything else.

  `Instance` no longer carries its entity: it is `{ id, kind }` with a phantom `Instance<Tag>` parameter, and `isInstanceOf` compares tags. Engine-owned visibility is a plain `visible: boolean` field (replacing `~visible`). At the renderer seam, frame data is the typed union itself — `FrameData.ts` and its casts are deleted; the renderer narrows on `_tag` through an exhaustive registry.

- 31d0718: The renderer is three.js/WebGPU; ThorVG is retired.

  **BREAKING (pre-1.0 minor):** `@effect-motion/thorvg` is deleted and no longer published. Two packages replace it: `@effect-motion/three`, a bindings-only Effect wrapper over three.js (browser entry plus a `/node` entry that installs Dawn-backed WebGPU and the environment shims three needs), and `@effect-motion/renderer`, the retained frame renderer — the only place frames meet three — with a browser canvas adapter and a headless Node PNG adapter, consumed by the player and export.

  Core goes renderer-free: `Renderer.ts`, `render/` (shapes, paint, CPU depth-of-field), and the render error channel are deleted from `effect-motion`; the frame stream (plus `Color` and camera resolution in `Projection.ts`) is core's renderer-facing contract, and no renderer dependency remains in its tree.

  Rendering semantics change with the backend: the entity render contract is retained `build`/`update`/`dispose` (replacing immediate-mode paint functions); strokes are perspective-correct world-unit widths; occlusion is the GPU z-buffer (deterministic `renderOrder` breaks coplanar ties) instead of painter's-order sorting; depth of field is per-pixel GPU post-processing, still bypassed at aperture 0; text renders as SDF glyphs (troika-three-text) with real `Font` resource resolution. The camera model is redefined in three-native terms, preserving the y-down/top-left scene space, the z=0 identity invariant, and the AE-style focal-length default.

  `@effect-motion/react`'s Player and `@effect-motion/export`'s pipeline are rewired to the new renderer (GPU render-target readback → PNG → ffmpeg; the player pre-warms the renderer to absorb the first-frame pipeline compile). Determinism is clarified as stopping at the frame stream: same seed + settings → same frames; pixel-identical rendered output across backends is explicitly not a goal.

### Patch Changes

- 5633f96: `Line` composes both endpoints from its `position`. The renderer ignored `start` entirely and reconstructed the far endpoint as if `end` were absolute — recovering the ancestor offset via `world - position` and adding `end` to that, which only happened to work while `start` sat at the origin. A line carrying both corners in `start`/`end` with `position` at the origin collapsed: every edge drew from the scene origin to its end corner instead of spanning the two corners. Each endpoint is now `world + its own offset`, so a zero/zero line is a point at `position`.
- 5633f96: Text meshes stay hidden until their glyph attributes land. The SDF material references the instanced `glyphBounds`/`glyphUvRect` attributes, but those are only installed after async typesetting and layout resolve. Frames rendered in between drew the mesh with `instanceCount` 0 while the shader still looked for attributes the geometry did not have, so three logged "AttributeNode: Vertex attribute not found on geometry" every frame until layout landed. Visibility is now gated on the attributes being present — mirroring what the image renderer already does with its decode — with the caller's intent recorded and applied once the buffers are installed.
- Updated dependencies [31d0718]
- Updated dependencies [bdac91f]
- Updated dependencies [b7c330b]
- Updated dependencies [31d0718]
- Updated dependencies [31d0718]
- Updated dependencies [b7c330b]
- Updated dependencies [31d0718]
  - effect-motion@0.5.0
  - @effect-motion/three@0.5.0
