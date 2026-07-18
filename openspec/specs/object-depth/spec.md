# object-depth Specification

## Purpose
Per-object depth: shapes carry a z coordinate and a rectangular plane carries Euler orientation, so it can sit at a depth and tilt in 3D (billboard when unrotated).


## Requirements

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

### Requirement: Skeletal shapes project per point

The pipeline SHALL distinguish two positioning tiers: planar shapes (Rect, Image, Text) position as anchor + Euler orientation, and skeletal shapes (Line, Path) position per point, each defining point carrying its own world depth. The renderer SHALL project a Line's two endpoints independently (unconditionally — not gated on `z ≠ z2`) and paint the exact screen segment. The renderer SHALL likewise project every command point of a Path independently (anchor plus local point, unconditionally) and paint the exact screen polyline/polygon per subpath. The semantic `~position` trait SHALL move any entity of either tier rigidly as one unit; only raw field vocabulary differs between tiers.

#### Scenario: A depth-spanning line foreshortens per endpoint

- **WHEN** a Line runs from `(0, 200, 0)` to `(0, 200, 2000)` under the default camera
- **THEN** each endpoint is projected with its own perspective scale and the screen segment connects the two projected points (a rail receding toward the vanishing point)

#### Scenario: Flat lines are bit-identical to the billboard path

- **WHEN** a Line has `z = z2 = 0` under the resting camera
- **THEN** the per-endpoint projection produces the same screen segment as the previous single-anchor billboard path (identity invariant)

#### Scenario: A depth-spanning path foreshortens per point

- **WHEN** a Path's commands trace points at increasing `z` under the default camera
- **THEN** each point is projected with its own perspective scale and successive spans converge toward the vanishing point

### Requirement: Segment near-plane clipping

A Line with one endpoint at or behind the camera's near plane SHALL be clipped against the near plane in view space (linear interpolation to the near depth), rendering only the visible portion. A Line entirely behind the near plane SHALL be culled.

#### Scenario: Line straddling the camera renders its visible part

- **WHEN** one endpoint is in front of the camera and the other behind it
- **THEN** the rendered segment runs from the visible endpoint to the near-plane intersection, with no folded or mirrored geometry

### Requirement: Segment depth key

A projected segment SHALL use its midpoint view-space depth as its single sort key for painter's ordering and as its depth-of-field blur-bucket key, and its stroke width SHALL scale by the midpoint's perspective scale. This is a deliberate one-key-per-paintable ceiling shared with tilted planes; the upgrade path (subdividing at blur-bucket depth boundaries) is recorded in the change design, not required.

#### Scenario: Segment sorts by midpoint

- **WHEN** a Line spans view depths 400 to 1200 and a billboard sits at view depth 900
- **THEN** the line's sort key is 800 and it paints behind the billboard

### Requirement: Path near-plane clipping

A Path subpath crossing the camera's near plane SHALL be clipped in view space: an open subpath is clipped per span (linear interpolation to the near depth), splitting into separate visible pieces when interior points fall behind the plane; a closed subpath is clipped as a polygon (winding preserved) before the per-vertex perspective divide. A Path entirely behind the near plane SHALL be culled.

#### Scenario: Open subpath straddling the camera splits

- **WHEN** an open subpath's interior point is behind the near plane while points on either side are in front
- **THEN** the rendered output is two disjoint visible pieces, each ending at a near-plane intersection, with no folded or mirrored geometry

#### Scenario: Fully-behind path culled

- **WHEN** every command point of a Path lies behind the near plane
- **THEN** the path paints nothing

### Requirement: Path depth key

A projected Path SHALL use the mean view-space depth of its near-visible points as its single sort key for painter's ordering and depth-of-field bucketing, and its stroke width SHALL scale by that depth's perspective scale. This is the same deliberate one-key-per-paintable ceiling as segments and tilted planes; the upgrade path (per-span keys) is recorded there.

#### Scenario: Path sorts by mean depth

- **WHEN** a Path spans view depths 400 to 1200 and a billboard sits at view depth 900
- **THEN** the path's sort key is the mean of its visible point depths and painter's order follows it deterministically
