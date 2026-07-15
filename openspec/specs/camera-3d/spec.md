# camera-3d Specification

## Purpose
A free 3D camera — world position, Euler orientation, and focal length — driven by the ordinary animators, whose view every instance is projected through. The resting camera reproduces plain-2D placement for z=0 content.


## Requirements

### Requirement: 3D camera as an animatable instance

The camera SHALL be an ordinary `Instance` carrying a 3D position (`x`, `y`, `z`), Euler orientation (`rotX`, `rotY`, `rotZ`), and a `focalLength`, so that all existing animators (`moveTo`, `tween`, `spring`, `fork`) drive it without special-casing. The camera SHALL never be drawn.

#### Scenario: Existing animators drive the 3D camera

- **WHEN** a scene runs `camera.pipe(moveTo({ z: -800 }))` and `camera.pipe(tween("rotY", 0, Math.PI/4))`
- **THEN** the camera's `z` and `rotY` fields animate frame-by-frame like any other numeric instance field
- **AND** the camera never appears in rendered output.

#### Scenario: Camera fields default to a usable identity

- **WHEN** a scene creates a camera without setting any field
- **THEN** position, all rotations default such that the camera looks straight down world `-z` with zero pan
- **AND** `focalLength` defaults to a value giving a natural (non-distorted) field of view for the frame's viewport.

### Requirement: Identity camera preserves plain-2D placement

With the default (identity) camera, an object at world `z = 0` SHALL project to the same screen coordinates it would occupy in a pure-2D scene, so that scenes not using depth render unchanged.

#### Scenario: z=0 objects under identity camera

- **WHEN** the default camera is active and a shape sits at world `(x, y, 0)`
- **THEN** it renders centered on screen `(x, y)` at scale 1
- **AND** output is byte-identical to the pre-3D renderer for a scene of only `z = 0` objects.

### Requirement: Camera produces a deterministic projection

Each frame the active camera SHALL yield a deterministic view + perspective projection derived only from its field values and the viewport size — no wall-clock, no RNG.

#### Scenario: Same camera state, same projection

- **WHEN** two frames have identical camera field values and viewport size
- **THEN** every projected screen coordinate and depth is bit-for-bit identical between them.
