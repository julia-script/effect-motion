## MODIFIED Requirements

### Requirement: Render order is view-space depth, not tree order

Occlusion SHALL be resolved by view-space depth via the GPU depth buffer — tree order SHALL NOT determine what is drawn in front of content at a genuinely different depth. Content at equal depth SHALL paint in tree order, later over earlier, like After Effects layers: the renderer nudges each leaf toward the camera by `rank · 1e-6` of its distance through a homothety about the eye, which leaves every pixel where it was and changes depth only, so the tie resolves identically in the z-buffer test and the transparent sort. Depths closer than that nudge MAY resolve by tree order. Translucent content (opacity < 1) SHALL NOT write depth, so it never hides content drawn after it — except in a depth-of-field render (camera `aperture > 0`), where it SHALL write depth so it blurs at its own depth rather than taking the blur of what lies behind it. The order SHALL be identical across runs and across the browser and Node renderers.

#### Scenario: A deeper object paints behind a nearer one regardless of tree order

- **WHEN** shape A is authored before shape B in the tree but A's world z is farther from the camera than B's
- **THEN** A appears behind B
- **AND** reversing their tree order does not change which one appears in front.

#### Scenario: Equal depth paints in tree order

- **WHEN** two shapes overlap at the same depth
- **THEN** the one later in the tree paints over the earlier one, with no z-fighting at any camera distance
- **AND** the order is identical across runs and across browser and Node.

#### Scenario: A see-through layer does not punch holes

- **WHEN** a Rect at 30% opacity overlaps text, before or after it in the tree
- **THEN** the text's glyphs stay fully drawn, tinted where the Rect covers them.

#### Scenario: A see-through layer on the focus plane stays sharp under depth of field

- **WHEN** a Rect at 50% opacity sits on the focus plane over the empty background with `aperture > 0`
- **THEN** it renders as sharp as with aperture 0
- **AND** the next aperture-0 frame renders exactly as on a renderer that never drew depth of field.

#### Scenario: Sort is deterministic on ties

- **WHEN** two translucent objects have equal view-space depth
- **THEN** they blend in tree order, later over earlier
- **AND** the order is identical across runs and across browser and Node.
