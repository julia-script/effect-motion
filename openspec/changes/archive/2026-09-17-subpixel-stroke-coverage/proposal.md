## Why

Thin outlines in the border lab change apparent weight between the stationary and fractionally translated samples. The screenshots establish a coverage-quality concern, not a proven rounding bug; we need to isolate rasterization, target resolution and display resampling before changing the stroke pipeline.

## What Changes

- Require fractional stroke widths and positions to survive through rendering without automatic integer-width clamping or pixel snapping.
- Diagnose geometry, coverage antialiasing, render-target sample counts, device-pixel ratio and CSS scaling separately; document the actual cause before selecting the correction.
- Make slow subpixel motion redistribute coverage smoothly, retaining visible subpixel strokes without promising identical crispness at every pixel phase.
- Apply consistent quality policy to the final output, paint-group targets and stroke-union masks.
- Add a documented width/offset/orientation matrix and browser/Node visual review at native output sizes and embedded-player sizes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `motion-renderer`: fractional stroke coverage, sampling coherence across render targets and appearance-based verification.

## Impact

Renderer stroke coverage and target allocation; three wrapper sampling configuration; React Player viewport/DPR handling only if diagnosis identifies a contribution; Node offscreen rendering; the border-quality examples. No new user-facing snapping option, minimum-width convention or graphics backend is proposed.

Integrate after `stroke-opacity-union` and `paint-order-compositing`, since those establish the mask and composition targets whose sampling must be verified. Investigation can begin independently. The implementation mechanism is evidence-gated; the observable quality requirements are ready to implement.
