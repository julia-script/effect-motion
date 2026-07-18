# camera-3d Specification

## Purpose
A free 3D camera — world position, Euler orientation, and focal length — driven by the ordinary animators, whose view every instance is projected through. The resting camera reproduces plain-2D placement for z=0 content.


## Requirements

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

### Requirement: Optional point of interest

The camera SHALL carry optional `poiX`/`poiY`/`poiZ` numeric fields (world coordinates of a point of interest). When present, the effective view orientation SHALL be derived by auto-orienting the camera toward the POI, with the explicit Euler fields composing after auto-orient (exact composition: the explicit rotation applies in the camera's own frame, then the aim), so a lone `rotZ` rolls about the view axis and the POI stays centered. When absent, the camera SHALL behave exactly as a one-node camera — existing scenes render byte-identical. The Runner SHALL NOT fill POI fields (explicit opt-in). The user's `rotX`/`rotY`/`rotZ` data SHALL never be overwritten by auto-orient — derivation happens at view-assembly time. The POI fields SHALL be plain numeric fields, tweenable and springable like any other. A partially-set POI (one or two of the three fields) SHALL be a loud defect at the point of use.

#### Scenario: Auto-orient toward the POI

- **WHEN** a camera has a POI set off its optical axis
- **THEN** the rendered view is rotated so the POI projects to the viewport center (before explicit Euler)

#### Scenario: Dutch angle composes after aim

- **WHEN** a camera aimed at a POI also sets `rotZ`
- **THEN** the view rolls about the view axis while remaining aimed at the POI

#### Scenario: Absent POI preserves current behavior

- **WHEN** a scene never sets POI fields
- **THEN** rendered output is identical to the one-node camera before this change

#### Scenario: POI is animatable

- **WHEN** a scene runs `Motion.tweenTo(camera, { poiX: 300 }, "1 second")` or springs a POI field
- **THEN** the aim animates frame-by-frame like any numeric field

#### Scenario: Orbit identity

- **WHEN** a resting camera's POI sits on its optical axis
- **THEN** the derived orientation is zero and the view equals the resting view exactly

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
