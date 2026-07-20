# projection Specification

## Purpose
Pure, sink-agnostic camera resolution — from camera fields and viewport size to the resolved view state the renderer consumes — usable without the Effect runtime and free of wall-clock/RNG so scenes stay frame-deterministic. Per-point screen projection is the GPU's job.


## Requirements

### Requirement: Pure, sink-agnostic projection module

A projection module SHALL provide the pure camera-resolution function — from camera field values and viewport size to the resolved view state (position, orientation, field of view, focus) the renderer consumes — usable without the Effect runtime and free of wall-clock/RNG access. Per-point and per-quad screen projection is the GPU's job and SHALL NOT be reimplemented on the CPU for rendering; the module retains only what frame-level determinism and the renderer's camera setup require.

#### Scenario: Camera resolution is arithmetic-only and deterministic

- **WHEN** the same camera fields and viewport are resolved twice
- **THEN** the resolved view state is bit-for-bit equal.
