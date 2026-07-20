# camera-3d Delta Specification

## MODIFIED Requirements

### Requirement: 3D camera as an animatable instance

The camera SHALL be an ordinary `Instance` carrying a 3D position, orientation, focal length, and depth-of-field fields (`focusDistance`, `aperture`), so that all existing animators (`moveTo`, `tween`, `spring`, `fork`) drive it without special-casing. The concrete field shape MAY be redefined in terms convenient for the three.js renderer (core adapts to the renderer, not vice versa), but every field SHALL remain a plain animatable numeric. The camera SHALL never be drawn.

#### Scenario: Existing animators drive the 3D camera

- **WHEN** a scene animates camera position and orientation fields with `moveTo` and `tween`
- **THEN** those fields animate frame-by-frame like any other numeric instance field
- **AND** the camera never appears in rendered output.

#### Scenario: Camera fields default to a usable identity

- **WHEN** a scene creates a camera without setting any field
- **THEN** position and all rotations default such that the camera looks straight down world `-z` with zero pan
- **AND** the focal length defaults to the AE-style value (`width × 50/36`) giving a natural field of view for the frame's viewport
- **AND** `focusDistance` defaults to the resting camera distance (the z=0 plane in focus) and `aperture` defaults to 0 (no depth of field).

### Requirement: Identity camera preserves plain-2D placement

With the default (identity) camera, an object at world `z = 0` SHALL project to the same screen coordinates it would occupy in a pure-2D scene, so that scenes not using depth render as plain 2D.

#### Scenario: z=0 objects under identity camera

- **WHEN** the default camera is active and a shape sits at world `(x, y, 0)`
- **THEN** it renders centered on screen `(x, y)` at scale 1.

### Requirement: Camera produces a deterministic projection

Each frame the active camera's resolved view state (position, orientation, field of view, focus) SHALL be a deterministic pure function of its field values and the viewport size — no wall-clock, no RNG. Frame data carrying the camera SHALL be bit-for-bit identical across runs; the rasterized pixels produced from that state are the renderer's concern and are not required to be byte-identical.

#### Scenario: Same camera state, same resolved view

- **WHEN** two frames have identical camera field values and viewport size
- **THEN** the resolved view state handed to the renderer is bit-for-bit identical between them.
