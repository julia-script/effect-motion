## MODIFIED Requirements

### Requirement: Focus fields are camera data
The camera SHALL carry a `focusDistance` (view-space distance to the sharp plane in world units, defaulting to the resting camera distance so a world-z=0 object is in focus for an untouched camera) and an `aperture` (the thin-lens radius in world units, defaulting to 0). Both SHALL be plain numeric fields driven by the existing animators, and both SHALL ride on frame metadata like the other camera fields.

#### Scenario: Rack focus is a plain tween
- **WHEN** a scene tweens `focusDistance` between two values
- **THEN** the sharp plane moves smoothly across frames with no DoF-specific animator

#### Scenario: Defaults keep the z=0 plane sharp
- **WHEN** a camera is created without setting focus fields
- **THEN** `focusDistance` equals the resting camera distance and `aperture` is 0

### Requirement: Blur follows depth deterministically
With `aperture > 0`, blur SHALL be per-pixel: a pure function of each pixel's view-space depth and the frame's camera — exactly zero at the focus plane, increasing continuously with distance from it, scaled by aperture. The circle of confusion SHALL follow the thin-lens model: a point at view distance d images to a disc of radius `aperture · |d − focusDistance| / d` world units on the focus plane, projected to pixels through the camera and capped at an internal maximum. The same frame data SHALL always produce the same blur field; rendered pixels are not required to be byte-identical across environments.

#### Scenario: The focus plane is sharp
- **WHEN** a shape sits at view depth equal to `focusDistance` with `aperture > 0`
- **THEN** it renders sharp (visually identical to the same shape with aperture 0)

#### Scenario: Off-plane content blurs, more with distance
- **WHEN** two identical shapes sit at increasing distances from the focus plane
- **THEN** both render blurred, the farther-from-focus one more strongly, with no discrete banding between depths

## ADDED Requirements

### Requirement: HUD content is exempt from depth of field
HUD content SHALL be drawn after, and composited over, the depth-of-field output, so it renders sharp regardless of the camera's `aperture`.

#### Scenario: HUD stays sharp over a blurred world
- **WHEN** a frame with `aperture > 0` has both off-plane world content and HUD content
- **THEN** the world content blurs and the HUD content renders exactly as it does with aperture 0

### Requirement: Depth of field is correct for opaque content only
Blur SHALL be derived from the depth buffer, so it is defined for opaque surfaces and perspective cameras. A semi-transparent shape SHALL blur at its own depth; what shows through it is not blurred at its own depth. This limit SHALL be documented on the camera's `aperture` field.

#### Scenario: A translucent shape blurs at its own depth
- **WHEN** a semi-transparent shape sits in front of off-plane content with `aperture > 0`
- **THEN** the covered pixels blur by the translucent shape's depth, not the content behind it
