# Validation — 2026-09-17

Implemented after paint-order-compositing and stroke-opacity-union. All three
changes are integrated in the border quality lab.

## Diagnosis and correction

The shared Stroke occupancy target was undersampling narrow silhouettes. The
[before](evidence/before.png) and [after](evidence/after.png) renders hold scene,
projection, output size (1920×1080), DPR (1), and frame (0) fixed. Quarter-unit
diagonal and circular strokes show markedly more continuous coverage after 2×
mask density, four raster samples, and mip-filtered reduction. A 4× reference
looked comparable for this matrix and required four times the mask pixels.

[Before target metadata](evidence/before-pipeline.json) and
[after target metadata](evidence/after-pipeline.json) retain the same fractional
52.25×52.25 local rectangle bounds and -26.125 origin. Its mask changes from
53×53 to 105×105 texels. Geometry and world translation are not snapped.
The mask contains occupancy only; color and stroke opacity are applied after
union. The alpha matrix was rendered again after the sampling change: joins,
self-crossings, multiple subpaths and retracing remain uniform; separate entities
still blend independently.

## Output paths

Node WebGPU renders include initial, middle, final, and independently rendered
final frames for root paint, explicit paint groups inside a depth scene, and
direct planar depth strokes. [Grouped](evidence/grouped.png) and
[depth](evidence/depth.png) controls have matching authored/projected geometry.
All preserve the faint thin edges; the additional group resolve can look slightly
softer. [Group metadata](evidence/grouped-pipeline.json) confirms four-sample
intermediate surfaces. [DPR 2 metadata](evidence/dpr2-pipeline.json) records a
3840×2160 final output and correspondingly denser masks.

Chromium WebGPU playback on macOS was inspected for all three paths at DPR 1,
including complete six-second translation/width animations. Native canvas checks
used 1920×1080 backing and CSS dimensions. Saved
[browser group](evidence/browser-grouped.png) and
[browser depth](evidence/browser-depth.png) screenshots show the final frame in
a 2300×1400 viewport. Browser and Node agree visually in stroke weight and
continuity. Embedded CSS presentation was also inspected at 680×382.5; downscaling
the finished canvas makes very thin strokes fainter, as expected. Physical
retina-browser output was not tested; DPR 2 was exercised in Node and structural
target tests. Player now requests the actual display DPR instead of attenuating it.

The lab documents these inspection conditions and provides separate players for
all three paths. Temporary browser sizing changes were reset after inspection.

## Resources and regression checks

- Sixteen retained outlines across eight opacity-only frames: sixteen initial
  mask allocations/rasterizations, no resizes, and all sixteen disposed on removal.
- Twelve DPR-2 iterations changing group scale and stroke width retain the same
  Stroke and target handle, with one allocation and eleven resizes. Mask and
  paint targets keep four samples, and fractional positions survive resizing.
- Thirty nested paint-bound updates/removal cycles verify retained fractional
  bounds, transforms and disposal.
- Frame tests preserve exact quarter/half-unit positions and the final (1, 1)
  translation over four seconds, with at least 240 distinct intermediate frames.
- Diagnostic 61-frame runs took about 2.8–5.4 seconds at DPR 1 and 8.5 seconds at
  DPR 2, including initialization, shader compilation, PNG encoding and file I/O.
  These are wall-time observations, not playback FPS benchmarks.

Root build and typechecks passed. Core: 260 tests; renderer: 45 tests; React:
1 test. Scoped Biome checks and git diff whitespace checks passed. All three
OpenSpec changes validate strictly. Visual acceptance uses appearance, without
pixel equality or numerical image tolerances.

## Reproduction

Run the docs development server and open `/docs/examples/border-quality`.
The diagnostic helper `packages/renderer/test/support/render-evidence.ts` accepts
a scene path, output directory, exported scene name, and optional pixel ratio.
Use `apps/docs/examples/subpixel-strokes.scene.ts` with exports `scene`,
`groupedScene`, and `depthScene`. Sampling constants live in the shared Sampling
actor; the selected coverage factor is 2 and raster sample count is 4.
