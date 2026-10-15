# Design

## Context

See proposal.md for motivation. Builtins currently converts M/L/Z commands to local polylines, triangulates closed contours, and renders planar strokes through one retained coverage mask. Nonplanar strokes use Three.js fat lines. Core schemas cannot depend on the renderer.

## Goals / Non-Goals

**Goals:** extend the existing typed geometry and preserve shared browser/Node behavior, deterministic frames, local depth, and retained geometry.

**Non-Goals:** SVG text parsing, compound fill-rule changes, path morphing, new shape entities, new semantic animators, configurable caps/joins. Three.js dash controls only cover the spatial fallback, while planar coverage has custom round silhouettes; cap/join choices therefore require additional rendering work and are deferred under the user's priority constraint.

## Decisions

### Commands

Use M/L/H/V/C/S/Q/T/A/Z and lowercase variants. Endpoints use x/y/optional z; cubic controls use x1/y1/z1 and x2/y2/z2, quadratic controls x1/y1/z1; smooth cubic S uses x2/y2/z2. H/h has x, V/v has y and preserves other coordinates. A/a uses rx, ry, xAxisRotation (degrees), largeArc and sweep (booleans), and endpoint x/y/optional z. Uppercase coordinates are offsets from entity position; lowercase coordinates are deltas from the current point, with absent z deltas zero. Absent absolute z is zero. Reflection includes depth. Arcs follow SVG endpoint conversion in local XY with linear z interpolation; sweep=true advances positive parametric angle (counterclockwise in this y-up scene). Zero radii become lines, coincident endpoints omit the arc, negative radii use absolute values, and undersized radii expand per SVG. First command is M or m. All command numbers are finite.

### Geometry boundary

Renderer-owned PathGeometry.flatten(commands) returns readonly Subpath arrays with plain {x,y,z} points and closed flags. Curves flatten adaptively at a fixed local-space tolerance, bounded subdivision, and exact authored endpoints. Geometry is cached by retained command identity. This evaluates typed geometry rather than parsing external content, and depends on no camera or wall clock.

Renderer-owned StrokeGeometry.apply(paths, style) consumes the same structural types. Style uses trimStart/trimEnd/trimOffset/strokeDasharray/strokeDashoffset. Both helpers remain pure, GPU-free modules; tests can compare independently known coordinates and distances.

### Stroke fields and semantics

Add a shared mixin to Line/Path/Rect/Circle/Ellipse: trimStart=0, trimEnd=1, trimOffset=0, strokeDasharray=[], strokeDashoffset=0. Numeric fields are finite; dash lengths are nonnegative. Raw Motion.tween/tweenTo animates scalar fields. Arrays can be replaced through ordinary instance updates.

Clamp start/end to [0,1]; end<=start is empty. Shift the interval by trimOffset (turns), modulo one, splitting wrapped intervals; a full interval stays full at every offset. Measure against total local 3D polyline length, including closures and excluding move gaps. Intersect each subpath with the resulting global intervals. Trim affects strokes only.

Dash lengths use local scene units. Repeat odd-length patterns twice; empty/all-zero patterns are solid. Zero-length entries must terminate safely and support round-cap dots for zero-length painted entries. Positive dash offset advances into the pattern; negative offsets normalize modulo the period. Phase restarts at each original subpath and remains anchored to its original start when trimmed. Compute dash/trim intersections without bridging gaps; reconnect coverage across a closed contour's seam when continuous. Uncut contours remain closed; cut contours are open. Untouched zero-length strokes preserve existing round-dot behavior, while empty trim paints nothing.

### Integration and ownership

Agent 1 owns Entity.ts schema changes, PathGeometry.ts and focused schema/curve tests. Agent 2 owns StrokeGeometry.ts and interval tests. Agent 3 owns Builtins.ts, any necessary Stroke.ts integration, and retained-renderer tests. Parent owns planning, docs/examples, integration review, and final checks. Agents share this checkout with disjoint ownership and do not commit.

Keep fills based on the original flattened path. Feed processed stroke fragments to both the planar coverage union and nonplanar fat lines. Cache spatial stroke rebuilds by geometry and stroke controls; color-only changes should reuse geometry. All original subpaths decide planar eligibility, so trimming cannot silently switch the entity's rendering semantics.

## Risks / Trade-offs

- Curve flattening is approximate → fixed deterministic tolerance, bounded recursion, exact endpoints, analytic fixtures including overshoot/inflection.
- Tiny dashes can generate excessive geometry → bounded processing with a clear loud failure rather than a hang or silent truncation.
- Closure and trim seams can add caps → preserve/merge connected intervals and test closed contours.
- GPU availability may differ → geometry and retained-state checks plus visual inspection using the existing renderer where available; no byte-exact raster assertions.

## Migration Plan

Defaults preserve existing geometry and solid strokes. Existing M/L/Z objects remain valid. Ship additive schema fields and documentation together; revert this change as one unit if needed.

## References

- https://www.w3.org/TR/SVG/paths.html
- https://threejs.org/docs/pages/Line2NodeMaterial.html
