# Proposal: path-3d-points

## Why

`Path` is the one shape left out of 3D — and out of rendering entirely: its geometry is an SVG `d` string, which the ThorVG renderer cannot paint (no `d` parser in the engine, deliberately deferred by the thorvg-single-renderer change), and which carries no per-point depth, so a path can never span 3D space the way a Line now does. The line-z2 change built the n-point machinery's 2-point trial run and recorded "3D Path (n-point polyline)" as the natural follow-on; this change is that follow-on.

## What Changes

- **BREAKING**: `Path`'s `d: string` is replaced by `points: Array<{ x, y, z? }>` — an ordered vertex list. `z` may be omitted per point (a pure-2D author never types it; absent depth renders as 0). No scene, example, or consumer in the repo uses `d`, and no renderer ever painted it.
- Points are **local to the path's `x/y/z` anchor**, preserving the `d`-era contract ("x/y offset the whole path"): the anchor translates the path rigidly, so the standard `~position` lens keeps working and translation never rewrites the array. Each point still projects with its own independent depth (anchor.z + point.z) — the skeletal doctrine's substance.
- `Path` gains `closed: boolean` (default `false`): stroking joins the last point back to the first; fill always paints the implicitly-closed region (SVG semantics). This replaces the `d` string's `Z` command.
- The renderer projects every path vertex independently (`Projection.projectPath` — the n-point generalization of `projectSegment`): near-plane clipping splits stroke geometry into visible runs and Sutherland–Hodgman-clips the fill contour; a path entirely behind the near plane culls.
- Path geometry is clipped to the viewport before painting (`Projection.clipPathToRect`, extending Line's `clipSegmentToRect` precedent — ThorVG stroke cost scales with full path extent, and near-clipped geometry projects enormous).
- Path gets a ThorVG paint function and joins `builtinPaints` — the "Path is omitted" carve-out in the coverage manifest is gone.

## Capabilities

### New Capabilities

None — this extends existing capabilities.

### Modified Capabilities

- `shapes`: `Path`'s field set becomes `points` + `closed` (replacing `d`); Path renders through the single renderer.
- `object-depth`: the skeletal tier generalizes from 2-point segments to n-point paths; path near-plane clipping (run splitting + contour clip) and the mean-contour depth key defined.

## Impact

- `packages/motion/src/shapes/Path.ts` — schema (points/closed), same lenses.
- `packages/motion/src/Projection.ts` — `projectPath`, `clipPolygonToRect`, `clipPathToRect`.
- `packages/motion/src/Renderer.ts` — flatten's skeletal branch handles `points` leaves; new `path` channel on `PaintProjection`.
- `packages/motion/src/render/shapes.ts` — `path` paint function (single shape when nothing clipped; split fill/stroke shapes when the near plane or viewport cut the geometry).
- Animators: `~position`/`~opacity` traits work unchanged; individual points are animated via `Scene.update` (raw tween targets remain scalar fields — per-point tween vocabulary is future work, recorded in design.md).
- Known accepted ceilings (shared with segments and tilted quads): uniform blur per primitive, single sort key, no stroke taper.
