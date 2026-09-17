## Why

The border lab and supplied triangle/rectangle screenshots show opacity accumulating where segments of one stroke overlap. One half-transparent stroke should remain half-transparent at its joins, closure seam and self-crossings; authors should not need to split or hide geometry to avoid patches.

## What Changes

- Treat a planar entity's complete stroke, including all of a Path's subpaths, as one coverage union and apply stroke paint opacity once.
- Preserve antialiased coverage at the union boundary, closure semantics, world-unit widths and ordinary blending between separate entities.
- Replace segment-by-segment compositing for planar strokes with a retained coverage-and-composite path; share it across Rect, Circle, Ellipse, planar Line and planar Path.
- Keep fill painting distinct: a translucent stroke may legitimately look different over a colored fill versus the surrounding background.
- Add reproducible join, closure, self-crossing and multi-subpath fixtures, including alpha 0, 0.25, 0.5, 0.75 and 1.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `motion-renderer`: require one opacity application per planar stroke; permit coverage geometry/masks instead of mandating direct three line geometry for every Path.

## Impact

Renderer Builtins, a renderer-owned Stroke actor, scoped mask/target resources and thin three wrapper support where required. Both browser and Node use the same path. Public stroke fields stay unchanged; corrected images are a bug fix.

Integrate after `paint-order-compositing` so stroke composites receive the same entity paint order. This change owns geometric coverage union and opacity; `subpixel-stroke-coverage` owns refinement of fractional-pixel sampling. Nonplanar 3D path self-intersections and general order-independent transparency remain outside this change; planar strokes also receive the fix when placed or tilted in a depth scene.
