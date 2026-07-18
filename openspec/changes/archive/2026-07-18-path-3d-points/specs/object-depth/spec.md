## MODIFIED Requirements

### Requirement: Skeletal shapes project per point

The pipeline SHALL distinguish two positioning tiers: planar shapes (Rect, Image, Text) position as anchor + Euler orientation, and skeletal shapes (Line, Path) position per point, each defining point carrying its own world depth. The renderer SHALL project a Line's two endpoints — and every vertex of a Path — independently (unconditionally, not gated on depth being non-uniform) and paint the exact screen geometry. The semantic `~position` trait SHALL move any entity of either tier rigidly as one unit; only raw field vocabulary differs between tiers.

#### Scenario: A depth-spanning line foreshortens per endpoint

- **WHEN** a Line runs from `(0, 200, 0)` to `(0, 200, 2000)` under the default camera
- **THEN** each endpoint is projected with its own perspective scale and the screen segment connects the two projected points (a rail receding toward the vanishing point)

#### Scenario: A depth-spanning path foreshortens per vertex

- **WHEN** a Path's vertices carry distinct depths under the default camera
- **THEN** each vertex is projected with its own perspective scale and the screen polyline connects the projected points

#### Scenario: Flat skeletal shapes are identical to the plain-2D drawing

- **WHEN** a Line or Path has all depths 0 under the resting camera
- **THEN** the per-point projection produces the authored screen coordinates exactly (identity invariant)

## ADDED Requirements

### Requirement: Path near-plane clipping

A Path with vertices at or behind the camera's near plane SHALL clip in view space with role-appropriate semantics: stroke geometry clips per edge (linear interpolation to the near depth), splitting the path into its visible runs — a run wrapping a closed ring's seam vertex is stitched into one polyline; fill geometry clips as a polygon (Sutherland–Hodgman over the implicitly-closed region), so the artificial clip edge bounds the fill but is never stroked. A Path entirely behind the near plane SHALL be culled.

#### Scenario: A middle vertex behind the camera splits the stroke

- **WHEN** an open Path's middle vertex lies behind the near plane while its neighbors are visible
- **THEN** the stroke renders as two separate visible runs, each ending at its near-plane intersection, with no folded geometry

#### Scenario: A straddling filled path fills only its visible side

- **WHEN** a closed filled Path has some vertices in front of the camera and some behind
- **THEN** the fill covers the near-plane-clipped region on the visible side, and the clip boundary carries no stroke

### Requirement: Path depth key and viewport clipping

A projected Path SHALL use the mean view-space depth of its visible (near-clipped) contour vertices as its single sort key and depth-of-field bucket key, with stroke width scaled by that depth's perspective scale — the n-point generalization of the segment midpoint key, sharing its recorded subdivision upgrade path. Path screen geometry SHALL be clipped to the viewport (plus a scaled-stroke margin) before painting, with the fully-inside path passing through untouched; a fully-offscreen Path SHALL be culled.

#### Scenario: Offscreen extent is bounded before painting

- **WHEN** a Path's projected geometry extends far beyond the viewport (e.g. near-clipped vertices)
- **THEN** the painted geometry is bounded to the viewport plus the stroke margin, and visible pixels are identical to the unclipped drawing
