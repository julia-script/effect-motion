## 1. Isolate the reported behavior

- [x] 1.1 Confirm paint-order-compositing and stroke-opacity-union integration; verify the final Stroke mask and Paint surface paths are identified in a short diagnostic record.
- [x] 1.2 Extend the lab with the documented width/offset/orientation matrix and one-unit/four-second translation; verify exact fractional frame values and labeled native-output conditions.
- [x] 1.3 Capture geometry, mask, resolved target and final canvas observations with dimensions/DPR/sample counts; verify native-size and CSS-scaled output are compared with one factor changed at a time.
- [x] 1.4 Record the demonstrated cause and selected correction in design.md; verify the evidence distinguishes expected phase softness from an actual pipeline defect and stays within the approved coverage approach.

## 2. Correct sampling without changing geometry

- [x] 2.1 Implement the selected coverage correction in the shared Stroke pipeline, using a supported supersampled occupancy fallback where needed; verify the width/offset matrix no longer exhibits the diagnosed disappearance or abrupt width steps.
- [x] 2.2 Centralize and propagate target-density/sample policy across stroke masks, paint surfaces and final output; verify target configuration under native scale, magnification, DPR 1 and DPR 2.
- [x] 2.3 Preserve fractional local origins and geometry across target resizing; verify slow translation and animated-width fixtures have no integer snapping or allocation-induced displacement.
- [x] 2.4 Verify resolve/filtering and premultiplied-alpha handling; confirm translucent self-crossing controls keep once-per-stroke alpha with no bright/dark fringes.
- [x] 2.5 Audit Player backing-size/CSS mapping and Node output dimensions, changing them only if the diagnosis requires it; verify matching final output scales and document expected external resampling differences.

## 3. Validate the complete rendering path

- [x] 3.1 Compare root paint, paint group inside depth, and planar depth controls in browser and Node at matching projected sizes; record visual agreement in weight, smoothness and continuity without numerical pixel tolerances.
- [x] 3.2 Run resize/zoom/removal cycles and representative multi-stroke scenes; record performance and live allocations, then select bounded sampling/reuse parameters that preserve the accepted appearance.
- [x] 3.3 Add structural regression tests for fractional geometry and target policy, update lab inspection notes and a bug-fix changeset; verify touched package checks/tests and formatting pass.
