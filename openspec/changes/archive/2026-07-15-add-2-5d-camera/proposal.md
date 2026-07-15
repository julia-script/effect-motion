## Why

Today's "depth" is fake parallax: `Layer.depth` ∈ [0,1] is only "what fraction of the camera pan/zoom a layer feels," render order is hard-wired to tree order, and there is no z-coordinate. We want effect-motion to be a real 2.5D library — the After Effects model: every object has a position in 3D space and an orientation, a free camera projects them (orbit / dolly / fly), and what is drawn in front is decided by depth-to-camera, not by where a node sits in the tree. Since there is no backwards-compatibility concern, this is the moment to reclaim the depth concept and build it properly.

## What Changes

- **BREAKING — remove `Layer`.** The parallax primitive (`shapes/Layer.ts`, `depth ∈ [0,1]`) is deleted. Perspective gives parallax for free (far objects move less on screen), so a separate parallax layer is redundant. HUD / screen-pinned content becomes an explicit non-projected pass instead of a `depth: 0` layer.
- **BREAKING — replace the pan+zoom camera with a 3D camera.** `Camera` gains `z` and orientation (`rotX/rotY/rotZ`, or a look-at target) and `focalLength` (FOV). It stays an ordinary animatable Instance, so `moveTo`, `spring`, `fork`, etc. drive it unchanged. `svg/camera.ts`'s zoom-about-center transform is removed; FOV subsumes it.
- **BREAKING — objects gain a 3D transform.** Shapes gain `z` (default 0) and optional `rotX/rotY/rotZ` (default 0 = billboard facing the camera), exposed as a shared `~transform3d` trait lens alongside the existing `~position`.
- **New — a projection module.** Pure, deterministic functions shared by both sinks: build view + perspective matrices from the camera, project world points to screen space, and return screen position + view-space depth + scale.
- **BREAKING — render pipeline becomes flatten → project → sort → paint.** The renderer stops painting in tree order. It flattens the tree to a draw list, attaches each entry's view-space depth, stable-sorts far→near, and paints sorted. A `Group` becomes pure coordinate composition, no longer a paint-order boundary.
- **New — tilted-plane rendering in both sinks.** Solid-fill planes project their 4 corners to an exact `<polygon>` (perspective-correct, both sinks). Text / nested-content planes render perspective-correct in the DOM sink (CSS 3D) and degrade to an affine parallelogram in the self-contained SVG-string sink — a named, documented limitation.
- **New — z-driven scale and optional depth fog** fall out of projection (near = bigger, far = smaller / fainter).

## Capabilities

### New Capabilities

- `camera-3d`: A 3D camera as an animatable instance — position, orientation, focal length — producing a deterministic view + perspective projection each frame.
- `object-depth`: Per-object z coordinate and 3D orientation (billboards + tilt-able planes) via a shared transform trait.
- `depth-render-order`: Flatten-project-sort-paint pipeline; render order determined by view-space depth, not tree order; `Group` as pure coordinate composition.
- `projection`: The pure projection/math module (matrices, world→screen, depth, quad corners) shared by all sinks.

### Modified Capabilities

<!-- No existing openspec/specs/ capabilities to modify — specs dir is empty; this is greenfield spec territory. -->

## Impact

- **Removed:** `packages/motion/src/shapes/Layer.ts`, `packages/motion/src/svg/camera.ts` (parallax/zoom), `Layer` export from `shapes/index.ts`.
- **Rewritten:** `Renderer.ts` (flatten+sort stage; `RenderFunction` contract changes so depth is computed before paint), `Camera.ts`, `svg/SvgRenderer.ts` + `svg/SvgDomRenderer.ts` (consume the draw list, not the tree), `svg/shapes.ts` (tilted-quad emission).
- **Added:** `packages/motion/src/Projection.ts` (or `svg`-agnostic `project.ts`), 3D fields on `Shape2D`, a demo scene.
- **Determinism:** projection is pure matrix math on scene data — no wall-clock, no RNG; the frame-exact / spring-settle invariants are untouched. The stable sort must be deterministic (tie-break on id).
- **Docs:** parallax examples and any `Layer`/camera-zoom docs are rewritten; new 3D-camera + depth examples added to the docs registry.
