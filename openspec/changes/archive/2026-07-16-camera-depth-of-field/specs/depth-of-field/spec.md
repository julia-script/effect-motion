# depth-of-field (delta)

## ADDED Requirements

### Requirement: Focus fields are camera data
The camera SHALL carry a `focusDistance` (view-space distance to the sharp plane, defaulting to the resting camera distance so a world-z=0 object is in focus for an untouched camera) and an `aperture` (blur strength, defaulting to 0). Both SHALL be plain numeric fields driven by the existing animators, and both SHALL ride on frame metadata like the other camera fields.

#### Scenario: Rack focus is a plain tween
- **WHEN** a scene tweens `focusDistance` between two values
- **THEN** the sharp plane moves smoothly across frames with no DoF-specific animator

#### Scenario: Defaults keep the z=0 plane sharp
- **WHEN** a camera is created without setting focus fields
- **THEN** `focusDistance` equals the resting camera distance and `aperture` is 0

### Requirement: Aperture zero is structurally off
With `aperture` 0 (the default), rendering SHALL take the existing single-scene paint path — no blur scenes, no per-paintable blur computation — and produce byte-identical output to a renderer without depth-of-field support.

#### Scenario: Existing scenes are unaffected
- **WHEN** any scene that never sets `aperture` renders
- **THEN** the framebuffer is byte-identical to the pre-DoF renderer's output

### Requirement: Blur follows depth deterministically
With `aperture > 0`, each paintable's blur SHALL be a pure function of its projected view-space depth and the frame's camera: exactly zero at the focus plane, increasing with distance from it, scaled by aperture. The same frame data SHALL always produce the same pixels.

#### Scenario: The focus plane is sharp
- **WHEN** a shape sits at view depth equal to `focusDistance` with `aperture > 0`
- **THEN** it renders with no blur (identical pixels to the same shape with aperture 0)

#### Scenario: Off-plane content blurs, more with distance
- **WHEN** two identical shapes sit at increasing distances from the focus plane
- **THEN** both render blurred, the farther-from-focus one more strongly

#### Scenario: Deterministic across runs
- **WHEN** the same frame renders twice
- **THEN** the framebuffers are byte-identical

### Requirement: Blur grouping preserves paint order
The renderer SHALL apply blur by grouping contiguous runs of the depth-sorted paint list that share a quantized blur amount into blurred sub-scenes, preserving the far→near painter's order exactly. Quantization SHALL be deterministic. Sharp runs SHALL paint into the root scene as without DoF.

#### Scenario: Occlusion order survives blurring
- **WHEN** a blurred far shape, a sharp mid shape, and a blurred near shape overlap
- **THEN** the near shape paints over the mid shape, which paints over the far shape, each with its own blur

### Requirement: One blur amount per paintable
A paintable SHALL receive a single blur amount from its anchor's depth; entities spanning depth internally (particle fields, tilted planes) blur uniformly. This approximation SHALL be documented.

#### Scenario: Particle field blurs uniformly
- **WHEN** a particle field's anchor sits off the focus plane
- **THEN** the whole field renders with its anchor's blur amount
