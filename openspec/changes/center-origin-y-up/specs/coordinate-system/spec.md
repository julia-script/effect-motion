# coordinate-system Specification (delta)

## ADDED Requirements

### Requirement: Scene space is right-handed, y-up, center-origin
Scene coordinates SHALL be **x right, y up, origin at the viewport center, +z toward the viewer** — a right-handed frame. `(0, 0)` is the center of the frame; the visible extent at z=0 under the resting camera is x ∈ [−width/2, +width/2], y ∈ [−height/2, +height/2]. This is the single authoring frame: there SHALL be no setting that changes axis direction or origin.

#### Scenario: Center means center
- **WHEN** a Circle is instantiated at position `(0, 0)` and the scene renders under the untouched camera
- **THEN** the circle appears exactly at the center of the output frame

#### Scenario: Positive y moves up
- **WHEN** an instance animates from `y: 0` to `y: 100`
- **THEN** it moves toward the top of the frame

#### Scenario: Symmetric coordinates render symmetrically
- **WHEN** two identical shapes sit at `(−200, 0)` and `(200, 0)`
- **THEN** they render mirror-symmetric about the vertical centerline of the frame

### Requirement: Positive rotation is counterclockwise on screen
Rotations SHALL follow the right-hand rule in scene space: positive `rotation.z` reads **counterclockwise** on screen; positive `rotation.x` and `rotation.y` follow the right-hand rule about their axes. Angle-valued APIs (e.g. orbit azimuth, particle launch angle) SHALL use the same counterclockwise-positive convention unless their own spec states otherwise.

#### Scenario: Positive rotZ turns counterclockwise
- **WHEN** a Rect animates `rotation.z` from 0 to a positive angle
- **THEN** it visibly turns counterclockwise on screen

### Requirement: Y-flips exist only at raster boundaries
Internal conversions between scene space and inherently y-down domains (font-metric text layout, texture/pixel readback) SHALL happen exactly once per boundary, at the boundary, and MUST NOT leak a second frame convention into authoring APIs or entity data.

#### Scenario: Text above the centerline
- **WHEN** a Text instance is placed at `y: 200`
- **THEN** it renders in the upper half of the frame, with subsequent lines of a multi-line string stacking visually downward
