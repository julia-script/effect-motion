# camera-3d (delta)

## MODIFIED Requirements

### Requirement: 3D camera as an animatable instance

The camera SHALL be an ordinary `Instance` carrying a 3D position (`x`, `y`, `z`), Euler orientation (`rotX`, `rotY`, `rotZ`), a `focalLength`, and depth-of-field fields `focusDistance` and `aperture`, so that all existing animators (`moveTo`, `tween`, `spring`, `fork`) drive it without special-casing. The camera SHALL never be drawn.

#### Scenario: Existing animators drive the 3D camera

- **WHEN** a scene runs `camera.pipe(moveTo({ z: -800 }))` and `camera.pipe(tween("rotY", 0, Math.PI/4))`
- **THEN** the camera's `z` and `rotY` fields animate frame-by-frame like any other numeric instance field
- **AND** the camera never appears in rendered output.

#### Scenario: Camera fields default to a usable identity

- **WHEN** a scene creates a camera without setting any field
- **THEN** position, all rotations default such that the camera looks straight down world `-z` with zero pan
- **AND** `focalLength` defaults to a value giving a natural (non-distorted) field of view for the frame's viewport
- **AND** `focusDistance` defaults to the resting camera distance (the z=0 plane in focus) and `aperture` defaults to 0 (no depth of field).
