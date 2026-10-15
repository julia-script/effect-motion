# Design

## Context

See proposal.md for motivation. The entity-model rewrite deliberately removed corner radii (D13), and Builtins still documents that removal. Rect currently scales a shared unit plane and sends its four corner points through retained planar stroke coverage.

## Goals / Non-Goals

**Goals:** preserve Rect identity and raw tween inference; share a single local contour between fill and outline; preserve retained coverage and lifecycle behavior.

**Non-Goals:** per-corner radii, a new entity or semantic animator, spatial extrusion, new parsing, pixel-exact renderer parity.

## Decisions

1. Restore only a uniform `cornerRadius`. D13 simplified the entity model, but a single numeric field now provides box-to-pill animation without an additional entity, trait, or renderer branch in the core. The closed union remains unchanged. Radius validation is finite; clamping belongs solely to rendering so easing overshoot and exact targets remain meaningful.
2. Generate a centered contour with 16 segments per quarter arc (at most 68 points), matching the existing circle's angular resolution. Write tangent endpoints exactly; deduplicate coincident pill/circle tangencies. Reflect coordinates for signed dimensions, preserving the old sharp rectangle's contour direction and starting corner at radius zero. A positive radius starts at the top-left top-edge tangent and travels clockwise for positive dimensions.
3. Inspect Three's ShapeGeometry/ShapeUtils and RoundedBoxGeometry source. Reuse ShapeUtils triangulation on the same points as the outline, as Path already does. RoundedBoxGeometry is a 3D box with a depth-limited radius, so it is unsuitable. Three curves would add independent flattening; raw lines would lose the planar opacity union. A shared point list keeps fill and stroke aligned.
4. Retain points and fill geometry by signed width, height, and effective radius. Use the existing shared unit plane at radius zero. Use existing fill geometry replacement/disposal and Stroke selection/coverage; color and opacity never enter the geometry key. Placement remains on the parent group.

## Risks / Trade-offs

- Fixed tessellation can show facets at extreme magnification → use the established circle resolution and bound work deterministically; no pixel-exact claims.
- Reflections reverse winding → double-sided fill and existing planar stroke coverage support both windings.
- Radius changes replace per-instance fill and stroke buffers → retain appearance-only updates and test disposal, including transitions back to shared geometry.
- Browser WebGPU may be unavailable → validate the example through the Node GPU adapter and state the evidence boundary.

## Migration Plan

Additive schema field defaults preserve authored scenes. Publish both packages together via changeset when integrated. Reverting this commit restores the sharp-only behavior; no stored-data migration is required.
