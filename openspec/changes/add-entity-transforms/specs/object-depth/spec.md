## RENAMED Requirements

- FROM: `### Requirement: Orientation tilts a Rect's plane`
- TO: `### Requirement: Orientation tilts planar shapes`

## MODIFIED Requirements

### Requirement: Orientation tilts planar shapes

Setting a non-zero `rotation` on a planar shape (Rect, Circle, Ellipse, Text, Image) — or inheriting one from an ancestor — SHALL orient its flat plane in 3D space (lie flat as a floor, tilt as a wall, spin in the picture plane), while it remains a single plane — never a mesh. A planar shape with no rotation anywhere in its ancestry SHALL render as a camera-facing billboard.

#### Scenario: A tilted solid Rect renders perspective-correct

- **WHEN** a solid-fill Rect has `rotation.x = π/3` (tilted away from the camera)
- **THEN** it renders as a perspective-correct quadrilateral (a trapezoid, not a parallelogram)

#### Scenario: Text spins in-plane

- **WHEN** a Text has `rotation.z = π/2`
- **THEN** it renders turned a quarter turn about its anchor

#### Scenario: Billboards ignore orientation cost

- **WHEN** a shape and all its ancestors have all `rotation` channels 0
- **THEN** it billboards to face the camera.
