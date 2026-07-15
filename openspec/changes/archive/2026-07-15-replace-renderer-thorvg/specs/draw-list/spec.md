## ADDED Requirements

### Requirement: Renderer-agnostic draw-list is the sink contract

The renderer SHALL emit each frame as a **draw-list**: an ordered sequence of paint nodes, each a backend-neutral description of one primitive — its kind (rect, circle, ellipse, path, text, group), resolved fill/stroke/opacity, and either a 2D affine transform or explicit screen-space points. The draw-list SHALL replace `SvgNode` as the contract between the flatten→project→sort pipeline and any sink. It SHALL contain no backend-specific concepts (no SVG tags, no ThorVG handles).

#### Scenario: A frame produces an ordered draw-list

- **WHEN** a frame with several shapes at different depths is rendered
- **THEN** the pipeline yields a draw-list whose entries are in painter's order (far→near)
- **AND** each entry describes its primitive kind, style, and screen geometry without reference to any specific renderer.

#### Scenario: A tilted Rect appears as explicit screen points

- **WHEN** a tilted `Rect` is rendered
- **THEN** its draw-list entry carries the four projected screen corners as an explicit polygon path, not an affine transform.

### Requirement: Determinism is asserted on the draw-list, not on pixels

The draw-list SHALL be pure, inspectable data derived only from scene state and the camera. Determinism SHALL be asserted on the draw-list (kinds, coordinates, fills, order). Rasterized pixels SHALL NOT be part of the determinism contract.

#### Scenario: Same frame yields an identical draw-list

- **WHEN** the same frame is rendered twice
- **THEN** the two draw-lists are deeply equal
- **AND** no rasterization is required to make that assertion.
