# Spec: motion-renderer

## ADDED Requirements

### Requirement: Single ThorVG-backed frame renderer
The motion package SHALL expose exactly one frame renderer, backed by ThorVG. There SHALL NOT be a generic pluggable-sink factory, a per-`(sink × entity)` render-function registry, or an intermediate virtual-node type. The renderer SHALL consume `@effect-motion/thorvg` and SHALL NOT require `packages/thorvg` to know about frames, entities, or projection.

#### Scenario: One renderer, no sink registry
- **WHEN** the motion package is inspected for render targets
- **THEN** there is a single ThorVG renderer and no generic sink factory or per-`(sink × entity)` context registry

#### Scenario: Frame production is unchanged
- **WHEN** a scene is run via `Scene.run`/`stream`/`play`
- **THEN** it produces the same `Frame` objects as before this change, without referencing any renderer

### Requirement: Frame pipeline preserved
The renderer SHALL flatten a frame's instance tree into a draw-list, compose ancestor world translations, project each paintable through the frame's camera, and paint in depth-sorted order (farthest first) with a stable id tie-break. Hidden instances (`$visible === false`) and their subtrees SHALL be skipped. A duplicate parent / cycle SHALL be a loud defect naming the instance. An unknown or missing instance id SHALL be a loud defect.

#### Scenario: Depth-sorted deterministic order
- **WHEN** multiple paintables project to the same depth
- **THEN** they are painted in ascending instance-id order, identically across runs

#### Scenario: Hidden subtree skipped
- **WHEN** an instance has `$visible === false`
- **THEN** neither it nor its descendants are painted

#### Scenario: Cycle is a defect
- **WHEN** an instance is referenced by more than one parent, or a cycle exists
- **THEN** the renderer dies with a defect naming the offending instance id

### Requirement: Direct-paint entity contract
Each entity type SHALL have a paint function that issues ThorVG C-API calls (via `@effect-motion/thorvg`) against the frame's shared canvas and scene. There SHALL be no intermediate description/virtual-node value returned by an entity. The set of paint functions SHALL be exhaustive over the built-in entity types at the type level, so a missing built-in is a type error rather than a runtime surprise.

#### Scenario: Built-in coverage is a type-level guarantee
- **WHEN** a built-in entity type has no paint function
- **THEN** the program fails to type-check

#### Scenario: Container paints nothing itself
- **WHEN** a container (Group / root) is painted
- **THEN** it emits no paint of its own; its position has already composed into its children's world coordinates during flatten

### Requirement: Projection applied as a ThorVG transform
A billboard paintable's screen affine SHALL be applied to its ThorVG paint as a single transform. When the affine is the identity (resting camera, z=0 content) the transform SHALL be skipped. A tilted plane (projection carrying a four-corner quad) SHALL be painted as an exact closed 4-point path from its projected corners. A paintable behind the camera (`scale <= 0`) SHALL be culled (not painted).

#### Scenario: Identity affine adds no transform
- **WHEN** a paintable's screen affine is the identity
- **THEN** no transform call is issued for it

#### Scenario: Tilted plane is an exact quad
- **WHEN** a rectangular plane has a nonzero rotation and projection yields a quad
- **THEN** it is painted as a closed path through its four projected corners, carrying the shape's fill/stroke/opacity

#### Scenario: Behind-camera paintable culled
- **WHEN** a paintable projects with `scale <= 0`
- **THEN** it is not painted

### Requirement: Node and browser output adapters
The renderer SHALL share one paint path across Node and browser, differing only in how the final framebuffer is read. A Node adapter SHALL produce a PNG buffer from the rendered framebuffer using the thorvg package's `encodePng`. A browser adapter SHALL blit the rendered RGBA framebuffer onto a target `HTMLCanvasElement`.

#### Scenario: Node renders to a PNG buffer
- **WHEN** a frame is rendered under the Node adapter
- **THEN** the result is a PNG-encoded byte buffer of the framebuffer

#### Scenario: Browser blits to a canvas
- **WHEN** a frame is rendered under the browser adapter with a target canvas
- **THEN** the framebuffer's pixels are written onto that canvas

#### Scenario: Same paint path both environments
- **WHEN** the same frame is rendered under either adapter
- **THEN** the flatten/project/depth-sort/paint steps executed are identical; only the final framebuffer read differs
