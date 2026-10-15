## MODIFIED Requirements

### Requirement: Frame pipeline preserved
The renderer SHALL walk a frame's instance tree composing ancestor world translations, sync the result into its retained three scene, and render each context according to its declared compositing mode: paint contexts use current instance-tree paint order, and depth contexts use GPU depth-buffer occlusion; `Shapes.Hud` subtrees render camera-independent after and above world content (see the hud-layer capability). Within depth contexts, translucent content at equal or near-equal depth SHALL draw in a deterministic order derived from the stable instance-id tie-break. Hidden instances (`visible === false`) and their subtrees SHALL be skipped. A duplicate parent / cycle SHALL be a loud defect naming the instance. An unknown or missing instance id SHALL be a loud defect.

#### Scenario: Deterministic order on depth ties
- **WHEN** multiple translucent paintables in a depth context share a view depth
- **THEN** they blend in ascending instance-id order, identically across runs and across browser and Node

#### Scenario: HUD tier renders after the world tier
- **WHEN** a frame contains both world and Hud content
- **THEN** all world content renders beneath every Hud element

#### Scenario: Hidden subtree skipped
- **WHEN** an instance has `visible === false`
- **THEN** neither it nor its descendants appear in the retained scene

#### Scenario: Cycle is a defect
- **WHEN** an instance is referenced by more than one parent, or a cycle exists
- **THEN** the renderer dies with a defect naming the offending instance id

#### Scenario: Paint ordering is independent of creation history
- **WHEN** a paint context reorders existing siblings without changing their geometry or positions
- **THEN** the next frame blends them in the new children order, identically in browser and Node, regardless of retained object creation order


### Requirement: Direct-paint entity contract
Each entity type SHALL have a retained render implementation providing `build` (create the three object on first appearance), `update` (mutate it when data or world position changed), and `dispose` (release its GPU resources when the instance leaves the frame), plus billboard participation. There SHALL be no intermediate description/virtual-node value returned by an entity. The set of render implementations SHALL be exhaustive over the built-in entity types at the type level (the renderer's manifest imports the built-in entity types from core and must cover them), so a missing built-in is a type error rather than a runtime surprise. Custom entities — defined in userland via core's Entity API — SHALL register their render implementation with the renderer package through the same contract; a frame referencing an entity with no implementation SHALL die with a defect naming the entity.

#### Scenario: Built-in coverage is a type-level guarantee
- **WHEN** a built-in entity type has no render implementation
- **THEN** the program fails to type-check

#### Scenario: Container paints nothing itself
- **WHEN** a non-isolating container (inherited Group / root) is rendered
- **THEN** it emits no object of its own; its position has already composed into its children's world coordinates during the walk

#### Scenario: Unchanged instances are not touched
- **WHEN** consecutive frames carry an instance with identical data and world position
- **THEN** its retained geometry and paint data are not rebuilt between those frames; ordering metadata SHALL still change when its paint position changes

#### Scenario: Departed instances are disposed
- **WHEN** an instance present in frame N is absent from frame N+1
- **THEN** its object is removed from the three scene and its GPU resources disposed

### Requirement: Sized-group comps composite through render targets
An explicitly mounted scene SHALL composite through a render target using composition bounds and background from its scene metadata, not fields on Group. Children SHALL clip to those composition bounds. An explicit paint group SHALL also composite through a retained target, with transparent background and automatically derived content bounds that include stroke and antialiasing extents. In both cases group opacity SHALL apply to the composited result as a whole, not per-child. Inherited groups SHALL remain non-isolating.

#### Scenario: Group opacity applies to the composite
- **WHEN** an explicit paint group or scene mount with opacity 0.5 contains two overlapping opaque children
- **THEN** the overlap region shows the group at 0.5 over the backdrop — not the children blended into each other at 0.5 each

#### Scenario: Moving content expands paint-group bounds
- **WHEN** a paint group's child moves beyond its previous extent or its stroke grows
- **THEN** the complete visible content remains present without clipping or shifting its authored origin
