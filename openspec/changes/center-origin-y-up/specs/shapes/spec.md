# shapes Specification (delta)

## ADDED Requirements

### Requirement: Shapes anchor at their center
Extent-bearing shapes SHALL treat `position` as their **center**: a Rect or Square at `(0, 0)` renders centered on that point, extending ±width/2 and ±height/2, and rotation is about that center. Circle and Ellipse anchor at their center (unchanged). Text keeps its typographic anchoring (`textAnchor`/`baseline`, baseline-left default — see `three-text`). Line and Path are point-defined and carry no anchor. Corner or edge anchoring is NOT provided by this capability (deferred to a future placement-helpers change).

#### Scenario: Rect at origin is centered
- **WHEN** a Rect with `width: 200, height: 100` sits at position `(0, 0)`
- **THEN** its rendered bounds span x ∈ [−100, 100], y ∈ [−50, 50]

#### Scenario: Rotation is about the center
- **WHEN** a Square at `(300, 200)` animates `rotation.z`
- **THEN** it spins in place about `(300, 200)`, its center staying fixed
