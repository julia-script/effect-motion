## Why

The schema has always advertised `scale` and `rotation` on every paintable entity and `opacity` on Groups, and the docs promise you can "move, fade, or scale" a mounted scene — but the renderer silently ignored all three outside a tilted Rect: Groups composed translation only (a ponytail in `Sync.ts`), no builtin read `scale`, and a Group's opacity never reached its children. The dogfood promo (bug 3) lost every scale punch and spin to this, and `tweenTo` cannot reach nested `Vec3` fields, so there was no clean way to animate them either.

## What Changes

- The renderer walk composes each node's full transform — translate, rotate (Euler "ZYX", radians), scale — down the tree, about each entity's own `position`. Groups and Huds become real transform nodes.
- Every planar builtin (Circle, Ellipse, Rect, Text, Image, particle fields, Scene.play comps) honors its own and its ancestors' scale and rotation. Unrotated planar shapes still billboard; any composed rotation turns them into oriented planes (previously Rect-only).
- Skeletal builtins (Line, Path) map every local point through the composed matrix; Path fills triangulate in local space.
- A Group's opacity multiplies into every descendant (leaf data reaches renderers with ancestor opacity already applied), and into a comp's composite.
- The entity-renderer contract's `Leaf` gains `transform` (composed matrix, orientation, per-axis scale, and whether anything rotates). `Leaf.world` is kept.
- Equal-depth content paints in tree order (dogfood bugs 4, 5): each leaf is nudged toward the camera by a projection-preserving homothety of `rank·1e-6` of its distance, so later layers win depth ties without moving a pixel; the depth buffer is reversed-Z float so that nudge is resolvable at any distance; see-through materials (opacity < 1) stop writing depth; Text's fixed z-lift is gone.
- `Motion.scale`/`scaleTo` (number = uniform, or partial Vec3) and `Motion.rotate`/`rotateTo` (number = in-plane z spin in radians, or partial Euler Vec3), as base/To duals like `move`/`moveTo`.

## Capabilities

### Modified Capabilities

- `entity-transform`: transform composition semantics made concrete; Group opacity; scale/rotate animators.
- `object-depth`: orientation applies to every planar shape, not just Rect.
- `motion-renderer`: walk composes full transforms and opacity; `Leaf.transform`; billboard rule generalized; tree-order paint at depth ties.
- `depth-render-order`: equal-depth ties break by tree order (was instance id); translucent content writes no depth.
- `three-text`: text over a coplanar backdrop wins by paint order, not a z-lift.

## Impact

**`packages/renderer`** — `Sync.ts` walk/diff/comps, `Builtins.ts` placement, `EntityRenderer.ts` (`Transform`, `Leaf.transform`). **`packages/motion`** — `Motion.ts` gains four animators; the position animator is generalized over Vec3 fields (behavior unchanged). No schema change.

**Determinism** — frame data is unchanged for existing scenes; only rendering changes (previously ignored fields now take effect). Scenes that set `scale`/`rotation`/Group `opacity` and relied on them being ignored will render differently.

## Non-goals

Comps redesign, shear (still not expressible), stroke width scaling with `scale`, springs over scale/rotation (use easings or `Motion.drive`).
