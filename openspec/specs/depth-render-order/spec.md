# depth-render-order Specification

## Purpose
Depth-correct rendering: occlusion comes from the GPU depth buffer, with a stable id tie-break ordering translucent content at equal depth, so overlap is correct and deterministic across runs.


## Requirements

### Requirement: Render order is view-space depth, not tree order

Within a depth context, occlusion SHALL be resolved by view-space depth via the GPU depth buffer — tree order SHALL NOT override physically distinct depths. Paint contexts SHALL follow the paint-compositing capability instead. Translucent content at equal or near-equal depth SHALL blend in a deterministic order derived from the stable instance-id tie-break, identical across runs and across the browser and Node renderers.

#### Scenario: A deeper object paints behind a nearer one regardless of tree order

- **WHEN** a depth context contains shape A authored before shape B in the tree but A's world z is farther from the camera than B's
- **THEN** A appears behind B
- **AND** reversing their tree order does not change which one appears in front.

#### Scenario: Sort is deterministic on ties

- **WHEN** two translucent objects in a depth context have equal view-space depth
- **THEN** they blend in a stable, id-tie-broken order
- **AND** the order is identical across runs and across browser and Node.

### Requirement: Group is coordinate composition, not a paint-order boundary

An inherited `Group` in a depth context SHALL contribute its transform and position to its children's world coordinates but SHALL NOT isolate their depth — a group's children participate in the single global depth sort alongside everything else. An explicit `compositing: "paint"` group SHALL instead present a single composited surface to that depth context; its internal children SHALL follow paint order. Moving either kind of group SHALL still move its subtree.

#### Scenario: Grouped children interleave with ungrouped siblings by depth

- **WHEN** a depth context contains an inherited group with a far child and a near child, and an ungrouped shape sits at a depth between them
- **THEN** paint order is far-child, ungrouped-shape, near-child — the group does not keep its children contiguous.

#### Scenario: Moving a group moves its subtree

- **WHEN** `group.pipe(moveTo({ x: 100 }))` runs
- **THEN** every child's world x shifts by the group's composed transform, keeping local coordinates intact.

#### Scenario: Embedded paint group is atomic
- **WHEN** a paint group containing a background, border and label is embedded in a depth context
- **THEN** the three children paint in their declared order onto one surface
- **AND** surrounding objects occlude that surface by its external depth without interleaving with the group's internal children

### Requirement: Screen-fixed content renders outside the depth sort

Content marked screen-space (HUD) SHALL be painted after the depth-sorted 3D pass, in tree order, unaffected by the camera projection. This replaces the removed `depth: 0` parallax layer.

#### Scenario: A HUD title stays pinned while the camera flies

- **WHEN** an instance is marked screen-space and the camera dollies and orbits
- **THEN** the instance stays at its fixed screen position and scale every frame
- **AND** it is painted on top of all projected content.
