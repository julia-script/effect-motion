# projection Delta Specification

## MODIFIED Requirements

### Requirement: Pure, sink-agnostic projection module

A projection module SHALL provide the pure camera-resolution function — from camera field values and viewport size to the resolved view state (position, orientation, field of view, focus) the renderer consumes — usable without the Effect runtime and free of wall-clock/RNG access. Per-point and per-quad screen projection is the GPU's job and SHALL NOT be reimplemented on the CPU for rendering; the module retains only what frame-level determinism and the renderer's camera setup require.

#### Scenario: Camera resolution is arithmetic-only and deterministic

- **WHEN** the same camera fields and viewport are resolved twice
- **THEN** the resolved view state is bit-for-bit equal.

## REMOVED Requirements

### Requirement: Billboard projection yields an affine placement
**Reason**: Billboards are camera-quaternion-oriented objects projected by the GPU; no CPU affine placement exists.
**Migration**: `motion-renderer` billboard semantics.

### Requirement: Tilted solid-fill planes project to exact quadrilaterals
**Reason**: Tilted planes are real 3D meshes; the GPU projects them (with correct near-plane clipping for free).
**Migration**: `motion-renderer` billboard/tilt requirement.

### Requirement: Only rectangular solid planes tilt in the POC
**Reason**: The CPU-quad scoping constraint is obsolete; tilt scope is now a `motion-renderer` semantic decision (rects tilt, other billboards remain billboards) not a projection-math limitation.
**Migration**: `motion-renderer` billboard semantics document the current tilt scope.
