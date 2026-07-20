# depth-render-order Delta Specification

## MODIFIED Requirements

### Requirement: Render order is view-space depth, not tree order

Occlusion SHALL be resolved by view-space depth via the GPU depth buffer — tree order SHALL NOT determine what is drawn in front. Translucent content at equal or near-equal depth SHALL blend in a deterministic order derived from the stable instance-id tie-break, identical across runs and across the browser and Node renderers.

#### Scenario: A deeper object paints behind a nearer one regardless of tree order

- **WHEN** shape A is authored before shape B in the tree but A's world z is farther from the camera than B's
- **THEN** A appears behind B
- **AND** reversing their tree order does not change which one appears in front.

#### Scenario: Sort is deterministic on ties

- **WHEN** two translucent objects have equal view-space depth
- **THEN** they blend in a stable, id-tie-broken order
- **AND** the order is identical across runs and across browser and Node.
