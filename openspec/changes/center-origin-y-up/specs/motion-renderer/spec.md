# motion-renderer Specification (delta)

## MODIFIED Requirements

### Requirement: Scene space maps to three with the 2D identity invariant
Scene coordinates are right-handed, y-up, origin at the viewport center, +z toward the viewer (see `coordinate-system`) — axis-identical to three's space, so the renderer's scene→three mapping SHALL be the identity on positions and rotations, retained as a single named seam rather than dispersed conversions. Y-flips SHALL survive only at inherently y-down boundaries (font-metric text layout, texture/pixel readback), applied exactly once each. Content at z=0 under an untouched camera SHALL land exactly where a pure-2D placement puts it, so scenes not using depth render as plain 2D.

#### Scenario: Flat scene renders flat
- **WHEN** a scene uses no z and never touches the camera
- **THEN** every shape appears at its authored (x, y) position and size, with (0, 0) at the frame center

#### Scenario: No rotation conjugation
- **WHEN** a rect carries rotation `(rx, ry, rz)`
- **THEN** the three object receives the same Euler angles unnegated, and positive `rz` renders counterclockwise
