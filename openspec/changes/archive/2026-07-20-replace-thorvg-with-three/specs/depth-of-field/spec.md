# depth-of-field Delta Specification

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Blur grouping preserves paint order
**Reason**: The CoC-bucket/blurred-sub-scene mechanism was a CPU-rasterizer workaround. Per-pixel GPU DoF blurs continuously with depth; there are no quantized blur groups and no painter's-order sub-scenes to preserve.
**Migration**: Occlusion is resolved by the depth buffer (see `depth-render-order` delta); DoF is the `motion-renderer` post chain.

### Requirement: One blur amount per paintable
**Reason**: The one-blur-per-anchor approximation existed because blur was applied per paintable. Per-pixel DoF blurs each fragment by its own depth — entities spanning depth internally (particle fields, tilted planes) now blur correctly across their extent.
**Migration**: No consumer action; the documented approximation ceases to exist.
