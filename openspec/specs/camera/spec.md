# camera Specification

## Purpose
A scene has a single animatable camera — an ordinary `Instance` carrying a `~position` trait and a `zoom` field — that rides on frame metadata in world coordinates and is applied by the SVG sinks as a per-layer view transform. Parallax depth lives on a dedicated `Layer` entity, letting top-level layers move by a fraction of the camera so far layers lag and screen-fixed HUDs stay pinned, with existing camera-free scenes rendering byte-identically.

## Requirements

### Requirement: A scene has an animatable camera instance
The scene SHALL provide a camera as an ordinary `Instance` carrying a
`~position` trait (`{x, y}`) and a numeric `zoom` field, so the camera is
animated by the existing animators with no camera-specific animation code.
The camera SHALL default to identity (`x: 0`, `y: 0`, `zoom: 1`) so scenes that
never touch it render exactly as before. The camera SHALL NOT be drawn by any
sink.

#### Scenario: Default identity camera
- **WHEN** a scene runs without configuring a camera
- **THEN** the frame's camera metadata is `{ x: 0, y: 0, zoom: 1 }`
- **AND** every instance renders at the same screen position it did before the camera existed

#### Scenario: Camera animated by existing primitives
- **WHEN** the author applies `moveTo({ x: 400 })` and a `zoom` tween to the camera instance over a duration
- **THEN** the camera's `x` and `zoom` land frame-exactly on their targets on the final frame
- **AND** no camera-specific animator was required

#### Scenario: Camera is not rendered
- **WHEN** a frame containing the camera instance is rendered by a sink
- **THEN** the camera produces no drawn output

#### Scenario: An instantiated camera is not mounted into the render tree
- **WHEN** a scene instantiates a second camera (e.g. to swap it in as the active view)
- **THEN** that camera is NOT a child of the root group and does not appear in the render tree
- **AND** rendering the frame does not fail with an unknown-entity error

### Requirement: The camera rides on frame metadata in world coordinates
The runner SHALL expose the active camera's current `{x, y, zoom}` as frame/view
metadata (`FrameMeta.camera`). The camera SHALL NOT mutate any instance's entity
data; instance data SHALL remain in world coordinates regardless of camera
state.

#### Scenario: Camera exposed on the frame
- **WHEN** the camera is at `{ x: 100, y: 50, zoom: 2 }` and a frame is stepped
- **THEN** the frame's camera metadata reflects those values

#### Scenario: World coordinates unchanged by the camera
- **WHEN** an instance is at world `x: 100` and the camera pans and zooms
- **THEN** that instance's `data.x` remains `100` on every frame

### Requirement: The SVG sinks apply the camera as a per-layer view transform
Both SVG sinks SHALL apply the camera to each top-level layer as a wrapping
transform derived from `FrameMeta.camera`, without altering instance data. Zoom
SHALL scale layer contents about the viewport center (`width/2`, `height/2`).

#### Scenario: Pan moves the world opposite the camera
- **WHEN** the camera pans to `x: 100` on a full-depth layer
- **THEN** that layer's contents render shifted left by 100 screen units

#### Scenario: Zoom scales about the viewport center
- **WHEN** the camera zoom is `2` on a full-depth layer
- **THEN** that layer's contents render scaled 2× about the center of the viewport

### Requirement: A Layer entity carries parallax depth
Parallax depth SHALL live on a dedicated `Layer` entity — a container carrying
`children` plus a `depth` (defaulting to `1`), and no position or opacity of its
own — NOT on `Group`. This keeps `depth` from colliding with the transform
semantics a `Group` is expected to grow, and leaves room to restrict Layers
(e.g. forbid nesting) without affecting `Group`. A `Layer` is an ordinary
instance holding child ids (one tree, no second structure). A `Layer` renders as
a plain container (a `<g>`), drawing nothing of its own.

#### Scenario: Layer holds children at a depth
- **WHEN** a scene instantiates a `Layer` with `depth: 0.3` and some children
- **THEN** the children render inside that layer and the layer contributes depth `0.3` to the camera transform

#### Scenario: Group no longer carries depth
- **WHEN** a `Group` is instantiated
- **THEN** it has no `depth` field, and it feels the full camera (depth 1) like any other non-Layer top-level instance

#### Scenario: Nested Layers are undefined behavior (deferred)
- **WHEN** a `Layer` is authored inside another `Layer`
- **THEN** the behavior is documented as undefined for now — no guard is enforced in this change

### Requirement: The camera transform is scaled per top-level layer by depth
The applied camera transform for a top-level child of root SHALL be the full
camera scaled by that child's `depth`, affecting pan and zoom together: the layer
zoom SHALL be `1 + (camera.zoom - 1) * depth` and the layer pan SHALL be
`camera.pan * depth`. A `Layer` contributes its own `depth`; any other top-level
instance defaults to `depth: 1` (the full camera). `depth: 0` SHALL pin a layer
to the screen (no pan, no zoom); `depth: 1` SHALL apply the full camera.

#### Scenario: A Layer with default depth moves fully with the camera
- **WHEN** a top-level `Layer` has no `depth` set and the camera pans by 100 and zooms 2×
- **THEN** the layer pans by 100 and zooms 2× (full camera)

#### Scenario: Fractional depth produces parallax
- **WHEN** a top-level `Layer` has `depth: 0.3` and the camera pans by 100
- **THEN** that layer pans by 30 screen units
- **AND** a full-depth layer under the same camera pans by 100 (the far layer visibly lags)

#### Scenario: Depth zero is a screen-fixed HUD
- **WHEN** a top-level `Layer` has `depth: 0` and the camera pans and zooms
- **THEN** that layer neither pans nor scales — it renders identically to a camera at identity

#### Scenario: Non-Layer top-level content feels the full camera
- **WHEN** a bare shape (or a `Group`) sits at the top level and the camera pans
- **THEN** it moves with the full camera (depth 1), so parallax is opt-in via `Layer` without pinning ordinary content

#### Scenario: Existing scenes unaffected
- **WHEN** a scene never moves the camera and uses no `Layer`
- **THEN** output is byte-identical to before this change
