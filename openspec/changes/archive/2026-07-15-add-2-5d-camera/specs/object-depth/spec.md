## ADDED Requirements

### Requirement: Objects carry a z coordinate and 3D orientation

Every paintable shape SHALL carry a world `z` (default 0) and optional Euler orientation `rotX`, `rotY`, `rotZ` (default 0), exposed through a shared `~transform3d` trait lens so animators can drive them. `~position` SHALL remain a 2D (x/y) trait; `~transform3d` is additive and does not alter `~position` semantics.

#### Scenario: Default object is a billboard at z=0

- **WHEN** a shape is created without depth fields
- **THEN** its `z` is 0 and all rotations are 0
- **AND** it renders as a camera-facing billboard (a circle stays a circle) with no perspective distortion of its own geometry.

#### Scenario: Animating z moves the object in depth

- **WHEN** a scene runs `shape.pipe(tween("z", 0, -400))`
- **THEN** the shape's world depth changes each frame
- **AND** as it recedes it renders smaller (perspective foreshortening of position and size) under a non-identity-distance camera.

### Requirement: Orientation tilts a Rect's plane

Setting a non-zero `rotX`/`rotY`/`rotZ` on a `Rect` SHALL tilt its flat plane in 3D space (lie flat as a floor, tilt as a wall), while it remains a single plane — never a mesh. Tilt is scoped to `Rect` for the POC (see the projection capability); other shapes keep their orientation fields but render as billboards.

#### Scenario: A tilted solid Rect renders perspective-correct in both sinks

- **WHEN** a solid-fill Rect has `rotX = π/3` (tilted away from the camera)
- **THEN** both the SVG-string sink and the DOM sink render it as a perspective-correct quadrilateral (a trapezoid, not a parallelogram), because its four corners are projected individually
- **AND** both sinks emit identical polygon points.

#### Scenario: Billboards ignore orientation cost

- **WHEN** a shape has all rotations 0
- **THEN** it is projected by its single anchor point (no per-corner projection) for efficiency.
