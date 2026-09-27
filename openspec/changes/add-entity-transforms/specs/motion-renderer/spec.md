## MODIFIED Requirements

### Requirement: Frame pipeline preserved
The renderer SHALL walk a frame's instance tree composing ancestor transforms (translate, rotate, scale — see entity-transform) and ancestor opacities, sync the result into its retained three scene, and render world content with GPU depth-buffer occlusion; `Shapes.Hud` subtrees render camera-independent after and above world content (see the hud-layer capability). Content at equal depth SHALL paint in tree order — later over earlier, like After Effects layers — and translucent content SHALL NOT write depth (see depth-render-order). Hidden instances (`$visible === false`) and their subtrees SHALL be skipped. A duplicate parent / cycle SHALL be a loud defect naming the instance. An unknown or missing instance id SHALL be a loud defect.

#### Scenario: Deterministic order on depth ties
- **WHEN** multiple paintables share a view depth
- **THEN** they paint in tree order, identically across runs and across browser and Node

#### Scenario: HUD tier renders after the world tier
- **WHEN** a frame contains both world and Hud content
- **THEN** all world content renders beneath every Hud element

#### Scenario: Hidden subtree skipped
- **WHEN** an instance has `$visible === false`
- **THEN** neither it nor its descendants appear in the retained scene

#### Scenario: Cycle is a defect
- **WHEN** an instance is referenced by more than one parent, or a cycle exists
- **THEN** the renderer dies with a defect naming the offending instance id

### Requirement: Direct-paint entity contract
Each entity type SHALL have a retained render implementation providing `build` (create the three object on first appearance), `update` (mutate it when its data, effective opacity, or composed transform changed), and `dispose` (release its GPU resources when the instance leaves the frame), plus billboard participation. Each leaf SHALL be handed its composed world position and its full composed transform (matrix, orientation, per-axis scale, and whether any rotation applies), with ancestor opacity already multiplied into its data. There SHALL be no intermediate description/virtual-node value returned by an entity. The set of render implementations SHALL be exhaustive over the built-in entity types at the type level (the renderer's manifest imports the built-in entity types from core and must cover them), so a missing built-in is a type error rather than a runtime surprise. Custom entities — defined in userland via core's Entity API — SHALL register their render implementation with the renderer package through the same contract; a frame referencing an entity with no implementation SHALL die with a defect naming the entity.

#### Scenario: Built-in coverage is a type-level guarantee
- **WHEN** a built-in entity type has no render implementation
- **THEN** the program fails to type-check

#### Scenario: Container paints nothing itself
- **WHEN** a container (Group / root) is rendered
- **THEN** it emits no object of its own; its transform and opacity have already composed into its children during the walk

#### Scenario: Unchanged instances are not touched
- **WHEN** consecutive frames carry an instance with identical data, ancestor opacity, and composed transform
- **THEN** its retained object is not updated between those frames

#### Scenario: Departed instances are disposed
- **WHEN** an instance present in frame N is absent from frame N+1
- **THEN** its object is removed from the three scene and its GPU resources disposed

#### Scenario: Flat scene renders flat
- **WHEN** a scene uses no z and never touches the camera
- **THEN** every shape appears at its authored (x, y) position and size

### Requirement: Billboard semantics
Planar shapes (circles, ellipses, rects/squares, images, text) with no rotation of their own or in their ancestry SHALL be view-plane billboards (oriented to the camera each frame) so they keep their authored silhouette under any camera orbit. A planar shape with any composed rotation SHALL render as an oriented plane in 3D instead of billboarding.

#### Scenario: Circles stay circular through an orbit
- **WHEN** the camera orbits an unrotated circle at depth
- **THEN** the circle renders as a circle every frame, scaled by its distance

#### Scenario: Rotated rect foreshortens
- **WHEN** a rect has nonzero `rotation.y` and the camera looks along z
- **THEN** the rect renders as a perspective-foreshortened plane, not a billboard

#### Scenario: A rotated Group orients its children
- **WHEN** a circle sits inside a Group with nonzero rotation
- **THEN** the circle takes the group's orientation instead of billboarding
