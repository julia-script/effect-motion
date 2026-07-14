# frame-metadata Specification

## Purpose
Frames are self-describing for rendering: every emitted frame carries the frame rate and output resolution from the runner settings, so consumers (SVG sinks, video encoders, custom renderers) need no side-channel to size or time their output.

## Requirements

### Requirement: Runner settings define scene resolution
`Runner.Settings` SHALL include `width` and `height` numbers defining the scene's output resolution, defaulting to 500 and 300 when not set, alongside the existing `frameRate` default of 60.

#### Scenario: Defaults apply
- **WHEN** a scene is run with no settings
- **THEN** the effective settings have width 500, height 300, and frameRate 60

#### Scenario: Explicit resolution
- **WHEN** a scene is run with `{ width: 1920, height: 1080 }`
- **THEN** the effective settings carry those values

### Requirement: Frames carry render metadata
Every emitted `Frame` SHALL carry `frameRate`, `width`, and `height` taken from the runner's effective settings, so a frame is self-describing for rendering without access to the runner.

#### Scenario: Frame reflects settings
- **WHEN** a scene runs with `{ frameRate: 30, width: 800, height: 600 }` and a frame is stepped
- **THEN** the frame has frameRate 30, width 800, and height 600

#### Scenario: Every frame carries it
- **WHEN** a scene produces multiple frames (including frames from nested `Scene.play` branches)
- **THEN** each frame carries the same metadata from the single runner's settings

### Requirement: Sink render functions receive frame metadata
The generic renderer family (`Renderer.make`) SHALL pass the frame's
`{ frameRate, width, height, backgroundColor, camera }` to the sink's render
function, so custom sinks can size, time, and apply the view transform to their
output from the frame alone. `camera` SHALL be `{ x, y, zoom }` taken from the
runner's active camera, defaulting to `{ x: 0, y: 0, zoom: 1 }`.

#### Scenario: Custom sink reads metadata
- **WHEN** a sink's render function is invoked for a frame with width 800 and height 600
- **THEN** it receives a metadata argument with those values in addition to the entities and its config

#### Scenario: Custom sink reads camera metadata
- **WHEN** a sink's render function is invoked for a frame whose camera is `{ x: 100, y: 0, zoom: 2 }`
- **THEN** the metadata argument carries `camera` with those values
- **AND** when the scene never configures a camera, the metadata carries `camera: { x: 0, y: 0, zoom: 1 }`
