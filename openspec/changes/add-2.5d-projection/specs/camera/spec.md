## MODIFIED Requirements

### Requirement: A scene has an animatable camera instance

The scene SHALL provide a camera as an ordinary `Instance` carrying a world-space eye `position` (`{x, y, z}`), a look-at `target` (`{x, y, z}`), an `up` vector (defaulting to `+Y`), and a `projection` (`"perspective" | "orthographic"`, defaulting to perspective), so the camera is animated by the existing animators with no camera-specific animation code. The camera SHALL default to an identity view — an eye looking at the scene such that a scene which never touches the camera and uses no `z` renders as a flat plane at authored size. The camera SHALL NOT be drawn by any sink.

#### Scenario: Default identity camera

- **WHEN** a scene runs without configuring a camera and every entity is on the `z: 0` plane
- **THEN** each entity renders at the same screen position and authored size it did before a 3D camera existed

#### Scenario: Camera animated by existing primitives

- **WHEN** the author dollies the camera (`moveTo` its `position` toward the `target`) or orbits it over a duration
- **THEN** the camera's fields land frame-exactly on their targets on the final frame
- **AND** no camera-specific animator was required

#### Scenario: Camera is not rendered

- **WHEN** a frame containing the camera instance is rendered by a sink
- **THEN** the camera produces no drawn output

#### Scenario: An instantiated camera is not mounted into the render tree

- **WHEN** a scene instantiates a second camera (e.g. to swap it in as the active view)
- **THEN** that camera is NOT a child of the root group and does not appear in the render tree
- **AND** rendering the frame does not fail with an unknown-entity error

### Requirement: The camera rides on frame metadata in world coordinates

The runner SHALL expose the active camera's current `position`/`target`/`up`/`projection` as frame/view metadata (`FrameMeta.camera`). The camera SHALL NOT mutate any instance's entity data; instance data SHALL remain in world coordinates regardless of camera state.

#### Scenario: Camera exposed on the frame

- **WHEN** the camera's eye is at `{x, y, z}` looking at a `target` and a frame is stepped
- **THEN** the frame's camera metadata reflects those values

#### Scenario: World coordinates unchanged by the camera

- **WHEN** an instance is at world `{x: 100, y: 0, z: 0}` and the camera dollies and orbits
- **THEN** that instance's `data.x/y/z` remain `{100, 0, 0}` on every frame

### Requirement: The SVG sinks apply the camera through the projection pass

Both SVG sinks SHALL render the depth-ordered draw list produced by the projection pass (see the depth-projection capability), wrapping each leaf's 2D output in the projected `translate`/`scale`, without altering instance data. The sinks SHALL NOT apply a per-top-level-layer parallax transform.

#### Scenario: Dolly enlarges the subject

- **WHEN** the camera's eye moves toward the `target` under perspective
- **THEN** entities on the target plane render larger about the viewport center

#### Scenario: Orbit re-sorts depth

- **WHEN** the camera orbits to the far side of depth-staggered entities
- **THEN** their paint order reverses (see depth-projection)

### Requirement: Screen-space overlays are pinned, world content is projected

A top-level container MAY declare its space as `"world"` (default, projected through the camera) or `"screen"` (an overlay pinned to the viewport, flattened but NOT projected, painted on top). A `screen` container's subtree SHALL render at its raw `{x, y}` regardless of camera state. This replaces the former `Layer.depth`-based parallax and HUD mechanism.

#### Scenario: A screen-space HUD ignores the camera

- **WHEN** a top-level container is `space: "screen"` and the camera dollies and orbits
- **THEN** its subtree renders identically under any camera (a fixed overlay)

#### Scenario: World content is projected and depth-ordered

- **WHEN** a top-level container is `space: "world"` (or unspecified)
- **THEN** its subtree is projected through the camera and depth-ordered with the rest of the world content

## REMOVED Requirements

### Requirement: A Layer entity carries parallax depth

**Reason**: Real world z under perspective projection subsumes parallax — far content lags the camera automatically — so the `Layer.depth ∈ [0,1]` blend is redundant. The one irreducible case (a screen-pinned HUD) is replaced by the explicit `space: "screen"` overlay above.

**Migration**: replace `Layer` parallax layers with entities placed at a world `z`; replace `depth: 0` HUD layers with a `space: "screen"` container.

### Requirement: The camera transform is scaled per top-level layer by depth

**Reason**: The per-layer `1 + (zoom-1)*depth` / `pan*depth` transform is superseded by real projection: a leaf's screen motion under camera movement now emerges from its world z, not a blend fraction.

**Migration**: none needed at author level — place content at world depths; the projection pass produces the equivalent (and correct) parallax.
