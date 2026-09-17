## 1. Reproduction and geometry

- [x] 1.1 Confirm paint-order-compositing integration and reproduce the supplied alpha screenshots; verify triangle, rectangle, self-crossing, retraced and multi-subpath fixtures isolate one stroke from separate entities.
- [x] 1.2 Add the renderer Stroke actor with planar eligibility and silhouette construction; verify constant-local-z Path/Line classification, closure joins and open endpoints with geometry tests.
- [x] 1.3 Define retained stroke coverage inputs separately from color/opacity; verify alpha-only changes reuse coverage while width/geometry changes invalidate it.

## 2. Coverage union and paint

- [x] 2.1 Implement sample-level occupancy union with a supported multisampled or supersampled target; verify repeated coverage marks a sample once and separate covered samples survive resolve.
- [x] 2.2 Composite stroke color alpha and entity opacity once over resolved coverage; verify the half-alpha triangle has uniform fully covered joins and a zero-alpha stroke has no visible or occluding effect.
- [x] 2.3 Route Rect, Circle, Ellipse, planar Line and all planar subpaths of one Path through the shared stroke path; verify closed seams/self-crossings do not compound while two distinct entities still blend.
- [x] 2.4 Preserve fill-before-stroke, world-unit placement and transparent holes in depth contexts; verify colored-fill controls and a tilted outlined plane over background geometry.
- [x] 2.5 Keep nonplanar depth strokes on their existing path; verify a receding 3D line/path still uses per-point depth and perspective-scaled width.

## 3. Resource and quality verification

- [x] 3.1 Reuse/clear/resize/dispose coverage resources through the renderer scope; verify animated bounds leave no stale pixels and live allocations stabilize after removal.
- [x] 3.2 Run alpha 0/0.25/0.5/0.75/1 visual cases in browser and Node, with fill/no-fill and independent-entity controls; record appearance-based results and confirm no opaque edge fringes.
- [x] 3.3 Profile static repeated frames and opacity-only fades with many outlines; record coverage regeneration and allocation counts showing retained reuse.
- [x] 3.4 Document once-per-stroke opacity and the planar scope, add a bug-fix changeset, and run touched package checks/tests/formatting; record passing commands and hand the final mask path to subpixel-stroke-coverage.
