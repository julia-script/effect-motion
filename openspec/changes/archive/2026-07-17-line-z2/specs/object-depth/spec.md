## ADDED Requirements

### Requirement: Skeletal shapes project per point
The pipeline SHALL distinguish two positioning tiers: planar shapes (Rect, Image, Text) position as anchor + Euler orientation, and skeletal shapes (Line) position per point, each defining point carrying its own world depth. The renderer SHALL project a Line's two endpoints independently (unconditionally — not gated on `z ≠ z2`) and paint the exact screen segment. The semantic `~position` trait SHALL move any entity of either tier rigidly as one unit; only raw field vocabulary differs between tiers.

#### Scenario: A depth-spanning line foreshortens per endpoint
- **WHEN** a Line runs from `(0, 200, 0)` to `(0, 200, 2000)` under the default camera
- **THEN** each endpoint is projected with its own perspective scale and the screen segment connects the two projected points (a rail receding toward the vanishing point)

#### Scenario: Flat lines are bit-identical to the billboard path
- **WHEN** a Line has `z = z2 = 0` under the resting camera
- **THEN** the per-endpoint projection produces the same screen segment as the previous single-anchor billboard path (identity invariant)

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
