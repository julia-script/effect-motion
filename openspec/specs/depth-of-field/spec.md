# depth-of-field Specification

## Purpose
Camera focus as tweenable data — `focusDistance` and `aperture` — driving a deterministic per-pixel circle-of-confusion in the renderer's GPU post-processing chain. Aperture 0 is a structural no-op: the DoF chain is bypassed entirely and the render path is the plain one.

## Requirements

### Requirement: Focus fields are camera data
The camera SHALL carry a `focusDistance` (view-space distance to the sharp plane, defaulting to the resting camera distance so a world-z=0 object is in focus for an untouched camera) and an `aperture` (blur strength, defaulting to 0). Both SHALL be plain numeric fields driven by the existing animators, and both SHALL ride on frame metadata like the other camera fields.

#### Scenario: Rack focus is a plain tween
- **WHEN** a scene tweens `focusDistance` between two values
- **THEN** the sharp plane moves smoothly across frames with no DoF-specific animator

#### Scenario: Defaults keep the z=0 plane sharp
- **WHEN** a camera is created without setting focus fields
- **THEN** `focusDistance` equals the resting camera distance and `aperture` is 0

### Requirement: Aperture zero is structurally off
With `aperture` 0 (the default), rendering SHALL take the plain render path — the depth-of-field post-processing chain is bypassed entirely, with no per-frame DoF computation or cost — and produce output indistinguishable from a renderer without depth-of-field support.

#### Scenario: Existing scenes are unaffected
- **WHEN** any scene that never sets `aperture` renders
- **THEN** the frame renders through the plain path with no DoF pipeline involvement

### Requirement: Blur follows depth deterministically
With `aperture > 0`, blur SHALL be per-pixel: a pure function of each pixel's view-space depth and the frame's camera — exactly zero at the focus plane, increasing continuously with distance from it, scaled by aperture. The same frame data SHALL always produce the same blur field; rendered pixels are not required to be byte-identical across environments.

#### Scenario: The focus plane is sharp
- **WHEN** a shape sits at view depth equal to `focusDistance` with `aperture > 0`
- **THEN** it renders sharp (visually identical to the same shape with aperture 0)

#### Scenario: Off-plane content blurs, more with distance
- **WHEN** two identical shapes sit at increasing distances from the focus plane
- **THEN** both render blurred, the farther-from-focus one more strongly, with no discrete banding between depths
