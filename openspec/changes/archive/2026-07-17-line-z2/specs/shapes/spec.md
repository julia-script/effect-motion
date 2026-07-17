## ADDED Requirements

### Requirement: Line endpoint depth
The `Line` entity SHALL carry a `z2` field (default 0), making its endpoint fields fully symmetric: `x`/`y`/`z` define the start point and `x2`/`y2`/`z2` the end point, all absolute world coordinates and all animatable as raw numeric fields. `Line` SHALL NOT carry Euler orientation fields — a segment is parametrized by its endpoints, never by an anchor plus orientation.

#### Scenario: Endpoints tween independently in depth
- **WHEN** a scene runs `Motion.tweenTo(line, { z2: -800 }, "1 second")`
- **THEN** the end point recedes in depth each frame while the start point stays fixed
- **AND** the end point's world path is a straight line in 3D

#### Scenario: Default z2 preserves flat lines
- **WHEN** a `Line` is instantiated with only `x`, `y`, `x2`, `y2`
- **THEN** both `z` and `z2` are 0 and the line renders exactly as a plain-2D line under the resting camera
