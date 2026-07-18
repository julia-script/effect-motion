# Design: path-3d-points

## Context

line-z2 established the two-tier positioning model: planar shapes carry anchor + Euler orientation; skeletal shapes carry independent world points, each projected with its own depth. Line was explicitly "the 2-point trial run" for skeletal Path. Meanwhile Path's `d` string left it doubly stranded: unpaintable (ThorVG has no `d` parser) and depth-blind (a string encodes no per-point z). The renderer's whole vocabulary — `projectSegment`, near-plane clipping, `PaintProjection` channels — already speaks points, not strings.

## Goals / Non-Goals

**Goals:**

- A Path whose every vertex occupies an independent 3D position, projected per point, near-plane-clipped correctly.
- Pure-2D authoring stays frictionless: `z` omittable per point.
- Preserve the identity invariant: a flat path under the resting camera renders exactly at authored coordinates.
- Preserve `~position` rigidity with the standard lens (no custom array-rewriting lens).
- Path finally renders through the single ThorVG renderer.

**Non-Goals:**

- Curves (bezier segments). The vertex list is a polyline/polygon; curve support is additive later (points could grow a segment-kind tag, or a `curveTo` sibling entity) without disturbing this schema.
- Per-point tween vocabulary (`tweenTo(path, { "points[2].z": ... })`) — raw tweens target scalar fields; points animate via `Scene.update` until a real design for indexed targets exists.
- Depth-strip subdivision, stroke taper, interpenetration-correct sorting — same recorded ceilings as segments and tilted quads.

## Decisions

### D1: `points` replaces `d` (breaking, but breaking nothing)

An SVG `d` string is a render-target encoding, not a geometry model: it cannot carry per-point depth, cannot be projected, and cannot be painted by the engine we ship. The vertex array IS the shape. No repo scene, example, or test used `d` beyond the schema default test, and no renderer ever painted it — the break is nominal. (Doctrine check: "the engine renders, it does not parse" — a `d` parser in the engine was always the wrong direction; authors with SVG source should convert to points in userland, before the scene runs.)

### D2: Optional per-point `z`, absent = 0

The user-facing contract is "2D authors never type z". `z: Schema.optionalKey(Number)` keeps authored data exactly what the author wrote; projection reads `p.z ?? 0`. This deliberately differs from Line's `z2: defaultedNumber(0)` (D2 of line-z2 rejected optional there): Line's endpoint fields must be raw-tweenable, and an absent scalar field is untweenable — but array elements are not raw-tween targets at all (see Non-Goals), so the tweenability argument doesn't apply inside `points`. The anchor's own `z` remains a defaulted, tweenable scalar.

### D3: Points are anchor-relative; Line's endpoints stay absolute

Line has no anchor separate from its points — `x/y/z` IS its first point, so all its points are group-space absolute and `~position` needs a custom delta-shifting lens. Path already has an anchor with a recorded contract ("x/y offset the whole path, keeping position animatable without rewriting `d`"). Keeping points local to the anchor preserves that contract, keeps the standard `positionLens`, and makes rigid translation O(1) instead of O(n) array rewriting. Depth truth is untouched: world point = anchor + point, each projected independently.

### D4: `projectPath` — near-plane semantics split by role

Stroke geometry clips like segments: each edge lerps to z = NEAR, splitting the path into visible runs (a middle vertex behind the camera yields two runs); a closed ring's visible stretch wrapping the seam vertex is stitched back into one run so it strokes with a join, not two caps. Fill geometry clips like a plane: Sutherland–Hodgman over the implicitly-closed polygon (identical loop to `projectPlane`). The two disagree only when clipping actually occurred — the artificial clip edge must bound the fill but must never be stroked.

### D5: Mean-of-visible-contour depth key

One paintable, one key: the mean view depth of the (near-clipped) contour vertices serves the painter's sort, the DoF bucket, and the stroke-width scale. The n-point generalization of the segment's midpoint (mean of 2 = midpoint). Same accepted ceiling, same recorded subdivision upgrade.

### D6: Viewport clipping via `clipPathToRect`, fill/stroke aware

Line's precedent (measured ~7×: ThorVG pays stroke cost for offscreen extent) applies with more force — near-clipped path geometry projects to tens of thousands of px. Runs clip per-edge with the existing `clipSegmentToRect`, splitting where they exit; the contour clips with a rect Sutherland–Hodgman (`clipPolygonToRect`). The fully-inside path (the overwhelmingly common case) is returned untouched, keeping the exact single-shape draw.

### D7: Paint splits fill and stroke only when clipped

Unclipped: one ThorVG shape, closed as authored, fill + stroke together — bit-identical to what a plain-2D path renderer would emit. Clipped (near plane or viewport): a fill-only shape from the contour and a stroke-only shape from the runs (multiple subpaths), because their geometries legitimately differ. Stroke width scales by the path's perspective scale in both.

## Risks / Trade-offs

- [Breaking `d` removal] → nothing in-repo consumes it; a userland `d`-to-points helper is the escape hatch and belongs in userland per the no-parsing doctrine.
- [Split fill/stroke shapes under clipping compose opacity per shape, not per path] → visible only for translucent filled+stroked paths that also cross the camera plane; accepted, noted here.
- [Anchor-relative points diverge from Line's absolute endpoints] → the trait layer hides it (`~position` rigid on both); raw vocabulary already differs per tier by design.
- [Stroke bleed loss at viewport edges for clipped paths] → margin covers the scaled stroke, matching Line's clip exactly.

## Open Questions

None blocking. Deferred by decision: curves (D1 alternative recorded), per-point tween targets, subdivision trigger point.
