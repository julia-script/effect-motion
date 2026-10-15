## ADDED Requirements

### Requirement: Fractional stroke geometry is preserved
Stroke rendering SHALL preserve finite positive fractional stroke widths and fractional positions without automatic pixel snapping or clamping to an integer minimum width. A zero-width stroke SHALL paint nothing. Perspective scaling SHALL remain based on authored scene-unit width rather than a screen-space hairline convention.

#### Scenario: Fractional width sweep
- **WHEN** strokes use widths 0.25, 0.5, 0.75, 1 and 1.5 scene units at a one-to-one scene-unit/device-pixel scale
- **THEN** they retain distinct fractional coverage rather than being rounded to zero or one pixel

#### Scenario: Smooth translation
- **WHEN** a one-unit stroke translates one scene unit over four seconds at 60 fps
- **THEN** rendered coverage follows the fractional positions without holding at integer pixel coordinates and jumping between them

#### Scenario: Perspective remains dimensional
- **WHEN** a world-unit stroke recedes from the camera in a depth context
- **THEN** its apparent width decreases with perspective, including through subpixel widths, without being pinned to a minimum screen width

### Requirement: Subpixel motion changes coverage smoothly
At an unchanged output scale, planar stroke edges SHALL redistribute coverage between neighboring pixels as their position or width changes. Horizontal, vertical, diagonal and curved portions SHALL use a consistent coverage convention. The renderer SHALL avoid conspicuous phase-dependent disappearance or abrupt apparent-width steps within the documented comparison matrix. Identical crispness or identical individual pixel values at every fractional phase SHALL NOT be required.

#### Scenario: Quarter-pixel offsets
- **WHEN** equal thin rectangles are compared at offsets 0, 0.25, 0.5 and 0.75 device pixels on each axis
- **THEN** edge softness can differ, but complete edges do not disappear and apparent stroke weight remains visually consistent

#### Scenario: Animated width crosses one pixel
- **WHEN** a stroke's projected width increases continuously from 0.25 to 1.5 device pixels
- **THEN** its coverage changes progressively without an integer-width threshold

### Requirement: Sampling quality survives compositing
Stroke masks, embedded paint surfaces and final output SHALL preserve antialiased coverage through composition and resizing. Coverage SHALL NOT be multiplied twice, thresholded into binary opacity during resolve, or lost because an intermediate target silently omits the required sampling behavior. Target sizing SHALL account for output scale, device pixel ratio and projected magnification without snapping the authored geometry.

#### Scenario: Direct and grouped comparison
- **WHEN** the same planar thin stroke is rendered directly and through a paint group at the same final size
- **THEN** the group introduces no conspicuous coverage loss, opacity shift or additional aliasing

#### Scenario: Output scale changes
- **WHEN** the canvas resizes or display pixel ratio changes while a scene is paused
- **THEN** the renderer updates required target resolutions while preserving the scene's positions and stroke widths

### Requirement: Stroke quality is verified by appearance and structure
The renderer SHALL support a reproducible diagnostic matrix recording authored width, offset, final output scale, device pixel ratio, orientation and frame. Browser and Node output SHALL look equivalent for matching output conditions. Verification SHALL inspect frame/geometry preservation and visual quality without byte-exact raster comparisons or cross-device pixel tolerances.

#### Scenario: Reproduce a quality finding
- **WHEN** a thin-stroke regression is reported from an embedded player
- **THEN** the fixture can be inspected both at native output size and at the reported display scale to separate renderer coverage from subsequent image resampling

#### Scenario: Cross-adapter review
- **WHEN** browser and Node render the same width/offset fixtures at matching dimensions
- **THEN** reviewers can compare smoothness and apparent stroke weight without requiring identical image bytes
