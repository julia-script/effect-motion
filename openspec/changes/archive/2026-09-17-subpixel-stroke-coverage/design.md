## Context

See [proposal.md](proposal.md). [subpixel-reference.png](evidence/subpixel-reference.png) records the reported difference between reference and animated outlines. A still screenshot does not establish coordinate rounding or prove temporal stepping.

Renderer.make already requests antialiasing. The installed Line2NodeMaterial defaults alpha-to-coverage on and selects a derivative-based coverage branch only when the active target has samples. Its alternative branch uses a hard discard. Renderer.renderCompTargets allocates targets separately from the main output, and the embedded Player scales its canvas. These are investigation leads, not an established diagnosis.

This change follows the Stroke mask and paint surface introduced by the other proposals. Inspect that final path, rather than fixing a shader that it no longer uses.

## Goals / Non-Goals

**Goals:** preserve fractional geometry; stable apparent weight during slow movement; consistent sampling through all intermediate targets; native-size and scaled-player reproduction.

**Non-Goals:** identical crispness at all pixel phases, automatic pixel snapping, minimum one-pixel hairlines, a new quality UI, exact pixel comparisons or unrelated Player refactoring.

## Decisions

### 1. Separate geometry, coverage, resolve and presentation

Use a fixed matrix: widths 0/0.25/0.5/0.75/1/1.5/2; x/y offsets 0/0.25/0.5/0.75 device pixels; horizontal/vertical/diagonal edges and curved outlines. Establish one scene unit per device pixel for the baseline, then repeat under known projection and viewport scales.

Observe separately:
1. Frame values and generated geometry before rasterization.
2. Coverage at the stroke target.
3. Resolved paint-group and final output targets.
4. Canvas at native output size versus CSS-scaled presentation.

Record browser/backend, scene and output dimensions, CSS dimensions, DPR, effective target density/sample count and frame. Change one factor at a time. A CSS-resampled screenshot cannot establish a renderer coordinate-quantization defect.

### 2. Continuous coverage is the quality contract

Maintain floating-point widths/positions through geometry and transforms. Integer target dimensions are legitimate allocation decisions; rounding the stroke's coordinates or clamping its width is not. The target's local-origin mapping must stay stable as bounds resize.

For the shared Stroke actor, retain sample-level union before resolve. Establish a coverage sampler adequate for fractional-width strokes: evaluate analytic silhouette coverage and a supersampled occupancy reference. The initial implementation direction is a shared coverage/sampling policy with a supersampled occupancy fallback, not another family of per-shape snapping rules.

Use the diagnosis to decide whether the minimal correction is target sampling propagation, derivative/filter footprint correction, target-density mapping, or presentation scaling. Record evidence and the chosen correction in this design before implementation of that correction. These are bounded alternatives within the same coverage pipeline; a new renderer/backend would require revising the proposal.

Alpha-to-coverage being enabled is not sufficient evidence of correct fractional coverage. In particular, preserve stroke alpha as a paint multiplier after union and avoid multiplying it again during coverage resolve/composite.

### 3. Resolve at sufficient output density

Centralize target-density/sample policy for main output, Stroke masks and Paint surfaces. Account for display DPR and projected magnification. Avoid a high-quality final canvas receiving a low-resolution or unsampled intermediate surface.

Choose filtering and premultiplied-alpha handling consistently across resolve and texture composition so edges do not acquire dark/bright fringes. Reallocate on relevant scale changes without altering frame data, dropping a border or shifting its origin. Bound allocations by device limits and report unsupported cases rather than silently losing content.

Do not promise arbitrary external image downscaling preserves the renderer's native appearance. Ensure Player canvas/backing-size mapping is correct; document the difference between native and embedded comparisons.

### 4. Acceptance is visual quality backed by structural evidence

Add exact tests for fractional frame/geometry preservation and target policy propagation. Keep visual review for apparent weight, continuity, orientation consistency and behavior through 0.25–1.5 device-pixel widths.

Compare 2D root, explicit paint Group inside a depth scene, and planar depth controls at equal projected sizes; use DPR 1 and 2 and a noninteger display scale. Include slowly translating and width-animating samples, and compare browser output to Node export.

Do not introduce pixel-byte equality, cross-device numerical image tolerances or temporal smoothing of scene data. A faint stroke is valid; a complete edge disappearing at selected ordinary fractional phases in the comparison matrix is the defect to eliminate. Sample redistribution/softness is expected.

## Risks / Trade-offs

- [The observed difference is partly expected phase softness] → Native-size and scaled controls prevent treating all antialiasing as a bug.
- [Supersampling costs memory and fill rate] → Use it as the reference/fallback, profile the matrix and representative scenes, and retain resources across frames.
- [A coverage improvement breaks stroke union] → Keep the self-crossing/alpha controls from stroke-opacity-union in the acceptance set.
- [Device sample limits differ] → Query supported capabilities and choose the same semantic coverage policy for browser and Node, with a supported fallback.
- [Resize causes shimmer] → Retain fractional local-origin transforms and verify repeated scale/bounds changes.

## Migration Plan

No author API migration. Start after the two preceding implementations have established the final composition/mask path; diagnostic evidence can be collected sooner. Land the smallest supported correction, update the lab and publish a bug-fix changeset. If performance fails the representative scenes, revise the internal sampling policy before release rather than hiding the issue behind integer snapping.

## Open Questions

- The numeric sampling density and allocation reuse threshold will be selected from measured visual/performance results; they do not change the fractional-geometry or opacity contracts.

## Implementation diagnosis (2026-09-17)

After the first two changes, native 1920×1080 Node renders at DPR 1 show broken,
dash-like coverage along the 0.25-unit diagonal and uneven dotted portions of the
0.25-unit circle (`/tmp/subpixel-before-direct/frame-0.png`). This exists before
CSS scaling. Rectangle positions/widths and the retained silhouette remain
fractional; there is no integer stroke-width clamp. The local occupancy mask is
only about one texel per output pixel and resolves four binary raster samples,
which undersamples these narrow diagonal/curved silhouettes. Translation filters
that already under-sampled result; it cannot recover missing coverage.

Paint-group targets also use the default zero-sample target, while the final GPU
canvas and Node scene pass use four samples. Groups retain their fractional bounds
origins, but another texture stage can soften the result. The Player requests
`1 + (devicePixelRatio - 1) * 0.75` rather than actual DPR: a DPR-2 native-size canvas
therefore has a 1.75 backing ratio. Its additional CSS downscaling is expected;
the native backing ratio reduction is unnecessary for the requested quality.

Selected correction: centralize a four-sample policy for raster stages and test
2× local coverage supersampling with mip-filtered area reduction as the first
bounded setting. Keep per-sample union before resolve; never blend segment alphas.
Compare against a denser occupancy reference before choosing the final factor.
Retain fractional geometry/origins, include the stroke's local z and off-center
bounds in projected density, and request actual display DPR from the Player.
An analytic per-segment coverage maximum was rejected because it loses disjoint
covered subpixel regions and does not preserve the union model for arbitrary
self-crossing/multiple-subpath strokes.

### Selected sampling parameters

2× mask density with four-sample occupancy and mip-filtered reduction removes the
obvious dashed quarter-unit diagonal seen in the baseline. The 4× reference
(`/tmp/subpixel-reference-4x/frame-0.png`) looks comparable to 2× for the matrix;
2× uses one quarter as many mask pixels, so it is the retained default. The group
path now has four samples as well. A quarter-unit rectangle's mask at DPR 1 is
105×105 rather than 53×53; its fractional bounds remain exactly 52.25×52.25 units.

61-frame diagnostic runs, including GPU initialization/compilation during first
render, PNG encoding and file I/O, took roughly 2.8–5.4 s at DPR 1; DPR 2 took
8.5 s. These are diagnostic wall times, not playback FPS benchmarks. Masks do not
rerasterize during translation or opacity-only changes at unchanged density.
Width/zoom changes resize the retained target, and removal releases it.
