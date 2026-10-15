# Proposal

## Why

Path currently supports only straight segments, preventing curved diagrams and trajectories. Animatable stroke trimming and dashes unlock drawing reveals and moving dashed connections without authors manually splitting geometry.

## What Changes

- Expand typed Path commands to the SVG command vocabulary: M/L/H/V/C/S/Q/T/A/Z and lowercase relative forms, retaining local 3D coordinates.
- Flatten curves deterministically into retained renderer geometry, with no SVG string parsing and no renderer dependency in core.
- Add stroke-only trimStart/trimEnd/trimOffset, strokeDasharray, and strokeDashoffset to strokable shapes. Defaults preserve complete solid strokes.
- Preserve fills, planar stroke coverage union, per-point depth, and shared browser/Node behavior.
- Evaluate caps and joins against the installed Three.js rendering path; include only if already supported without substantial custom rendering work.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `shapes`: full typed path vocabulary and portable trim/dash data.
- `motion-renderer`: deterministic curve flattening and stroke interval rendering.

## Impact

Changes affect motion entity schemas, renderer path/stroke geometry, focused tests, and author-facing examples/documentation. No new dependencies or entity types are required. Existing M/L/Z inputs remain supported; no new animator is required because numeric stroke fields use Motion.tween/tweenTo.
