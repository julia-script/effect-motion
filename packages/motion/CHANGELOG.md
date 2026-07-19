# effect-motion

## 0.3.2

## 0.3.1

### Patch Changes

- aabeb60: Declare `@effect-motion/thorvg` as a runtime dependency. `Renderer.js` imports it at runtime, but it was listed under devDependencies, so the published package failed with `ERR_MODULE_NOT_FOUND` for any consumer outside the workspace (e.g. `pnpm dlx @effect-motion/cli`).

## 0.3.0

### Minor Changes

- a765873: 2.5D/3D camera system: z-axis on entities with depth-sorted rendering, a free 3D camera with AE-style defaults (50mm focal equivalent) and near-plane clipping, depth of field (focusDistance/aperture with blur-bucketed rendering), a screen-space HUD layer via the identity camera, and a two-node camera with point of interest plus directing helpers.
- a765873: Shape and asset additions: image assets (Images annotation, Shapes.Image, session-held pictures), rounded corners on Rect (rx/ry), independent 3D depth per Line endpoint (z2), and Path 3D command geometry (M/L/Z with per-point z).

### Patch Changes

- a765873: Emit Node-ESM-compatible relative imports (`.js` specifiers) in built output.

## 0.2.0

### Minor Changes

- 75c9e81: Initial public release.
