# Proposal: wire-depth-aware-dof

## Why

`Camera.aperture` / `focusDistance` rode on every frame but drew nothing: both render paths rendered sharp and the camera docs called the fields "inert". `@effect-motion/three` now ships `PostProcessing.depthAwareDof` (a physical thin-lens CoC with a depth-peeled hidden layer), so the renderer can honour the fields.

## What Changes

- `aperture` gets a physical meaning: the **lens radius in world units** (the node's parameter). The renderer's derived `DofState.strengthUv` (a uv-space blur scale) is replaced by `aperture`.
- Browser (`Renderer.render`) and Node export (`renderToPng`) draw the world through the DoF chain whenever `aperture > 0 && focusDistance > 0`; the chain is built on the first frame that asks for it. Aperture 0 keeps the existing plain path untouched.
- HUD content is composited after / over the DoF output, so it stays sharp.
- Documented limits: opaque content only (blur comes from the depth buffer), perspective only, ~2× scene draw cost. `maxBlurPx` stays at the node default (30 render px).

## Capabilities

### Modified Capabilities

- `depth-of-field`: aperture is a world-unit lens radius with a thin-lens CoC; HUD content is exempt; the opaque-only limit is pinned.
- `docs-site`: depth of field is documented again (a camera/DoF guide plus live examples) now that it renders.

## Impact

`packages/renderer` (`Sync.ts`, `Renderer.ts`, `node.ts`), camera docs in `packages/motion` (`Entity.ts`, `Projection.ts`). No scene used a non-zero aperture, so no visual change for existing content.
