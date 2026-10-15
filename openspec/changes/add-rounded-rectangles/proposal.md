# Proposal

## Why

Authors need boxes that animate into pills without replacing a Rect with hand-authored Path commands. Restore a uniform radius as ordinary Rect data now that the retained renderer supports shared contour stroke processing.

## What Changes

- Add finite, animatable `Rect.cornerRadius`, defaulting to zero.
- Clamp only the rendered radius to half the smaller absolute dimension; preserve signed dimensions and authored values.
- Render matching rounded fills and outlines with existing trim, dash, transform, and planar coverage behavior.
- Add focused proofs, a box-to-pill example, documentation, and package changesets.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `shapes`: uniform rounded Rect geometry, animation, and retained rendering behavior.

## Impact

The core Entity schema and renderer Builtins change; core stays renderer-independent. Existing tween APIs handle the new field. No new dependency, entity tag, semantic animator, or publishing operation is required.
