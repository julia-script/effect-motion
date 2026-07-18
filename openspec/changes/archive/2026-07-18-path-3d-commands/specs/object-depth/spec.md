## MODIFIED Requirements

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

## ADDED Requirements

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
