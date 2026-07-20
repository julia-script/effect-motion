# depth-render-order Specification

## Purpose
Depth-correct rendering: occlusion comes from the GPU depth buffer, with a stable id tie-break ordering translucent content at equal depth, so overlap is correct and deterministic across runs.


## Requirements

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

### Requirement: Group is coordinate composition, not a paint-order boundary

A `Group` SHALL contribute its transform and position to its children's world coordinates but SHALL NOT isolate their depth — a group's children participate in the single global depth sort alongside everything else. Moving a group SHALL still move its subtree.

#### Scenario: Grouped children interleave with ungrouped siblings by depth

- **WHEN** a group contains a far child and a near child, and an ungrouped shape sits at a depth between them
- **THEN** paint order is far-child, ungrouped-shape, near-child — the group does not keep its children contiguous.

#### Scenario: Moving a group moves its subtree

- **WHEN** `group.pipe(moveTo({ x: 100 }))` runs
- **THEN** every child's world x shifts by the group's composed transform, keeping local coordinates intact.

### Requirement: Screen-fixed content renders outside the depth sort

Content marked screen-space (HUD) SHALL be painted after the depth-sorted 3D pass, in tree order, unaffected by the camera projection. This replaces the removed `depth: 0` parallax layer.

#### Scenario: A HUD title stays pinned while the camera flies

- **WHEN** an instance is marked screen-space and the camera dollies and orbits
- **THEN** the instance stays at its fixed screen position and scale every frame
- **AND** it is painted on top of all projected content.
