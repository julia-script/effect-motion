# image-assets Specification (delta)

## ADDED Requirements

### Requirement: Image placement is center-anchored
An Image's `position` SHALL be the center of the drawn picture — for both the explicit `width`/`height` size and the natural decoded size — matching Rect's anchoring (see `shapes`). Rotation does not apply (billboard only, unchanged).

#### Scenario: Image at origin is centered
- **WHEN** an Image with `width: 400, height: 300` sits at position `(0, 0)`
- **THEN** the picture renders centered on the frame center, spanning x ∈ [−200, 200], y ∈ [−150, 150]

#### Scenario: Natural size centers too
- **WHEN** an Image with no explicit dimensions decodes to 640×480 at position `(100, 50)`
- **THEN** the picture's center is at `(100, 50)`
