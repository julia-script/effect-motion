## Why

Ordinary 2D shapes at the same depth currently compete in the depth buffer: backgrounds can hide borders and child order does not reliably express layering. Authors need a 2D drawing surface that preserves paint order, including when that surface is embedded in a 3D scene.

## What Changes

- **BREAKING**: add explicit scene `compositing: "paint" | "depth"`, defaulting to `"paint"`. Existing scenes relying on world-depth occlusion opt into `"depth"`; no coordinate-based mode detection.
- Add `Group.compositing: "inherit" | "paint"`, defaulting to `"inherit"`. An explicit paint group forms a 2D compositing boundary inside a depth scene.
- Within a paint context, traverse current children order, paint each entity's fill before its stroke, and blend later siblings above earlier ones regardless of internal depth. Reordering must work without rebuilding entities.
- Composite an embedded paint group as one transparent surface in its surrounding depth context; outside objects still occlude it by depth. Keep grouping structure exclusively in the instance tree.
- Reuse retained composition resources, derive internal group bounds without adding public width/height fields, and preserve transparent holes and group opacity.
- Extend the border lab with zero-z layering and embedded-group cases. Retain independent 3D intersection behavior.

## Capabilities

### New Capabilities

- `paint-compositing`: ordering, atomic paint groups, transparency, nesting and resource behavior of a 2D paint context.

### Modified Capabilities

- `scene-composition`: explicit compositing metadata, defaults and propagation through frames and mounts.
- `depth-render-order`: scope depth-based occlusion and non-isolating groups to depth contexts.
- `shapes`: group compositing field and the distinction between inherited grouping and explicit paint boundaries.
- `motion-renderer`: ordered paint passes, retained order updates, and explicit composition boundaries instead of size-inferred ones.
- `three-text`: scope text depth occlusion to depth contexts and preserve text-over-backdrop painting inside paint contexts.

## Impact

Core Scene/Entity schemas and frame/mount metadata; renderer Sync, retained entity integration and composition targets; three wrapper material/target operations; browser and Node adapters; scene-authoring docs and existing 3D examples. No second renderer, second authored tree, or speculative GPU dependency is introduced.

Recommended delivery order: this change, `stroke-opacity-union`, then `subpixel-stroke-coverage`. The latter two own stroke-internal coverage; compositing an already incorrect stroke into a texture is not their fix. The default switch needs a breaking release note and an explicit depth-mode migration.
