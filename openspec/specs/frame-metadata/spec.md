# frame-metadata Specification

## Purpose
Frames are self-describing for rendering: every emitted frame carries the frame rate from the runner settings and the output resolution and background from the root scene's composition config, so consumers (SVG sinks, video encoders, custom renderers) need no side-channel to size or time their output.

## Requirements

### Requirement: The root scene defines scene resolution
The ROOT scene's composition config SHALL define the movie's output resolution and background: `width` and `height` numbers defaulting to 1920 and 1080, and `backgroundColor` defaulting to transparent. `Runner.Settings` SHALL NOT include `width`, `height`, or `backgroundColor`; it retains the existing `frameRate` default of 60.

#### Scenario: Defaults apply
- **WHEN** a scene created with no composition meta is run with no settings
- **THEN** the effective resolution is width 1920, height 1080, with frameRate 60

#### Scenario: Explicit resolution
- **WHEN** a scene created with `Scene.make(gen, { width: 1920, height: 1080 })` is run
- **THEN** the effective resolution carries those values

### Requirement: Frames carry render metadata
Every emitted `Frame` SHALL carry `frameRate` from the runner's effective settings and `width`, `height`, and `backgroundColor` from the ROOT scene's composition config, so a frame is self-describing for rendering without access to the runner.

#### Scenario: Frame reflects root scene config
- **WHEN** a scene with `{ width: 800, height: 600 }` runs with `{ frameRate: 30 }` and a frame is stepped
- **THEN** the frame has frameRate 30, width 800, and height 600

#### Scenario: Every frame carries it
- **WHEN** a scene produces multiple frames (including frames from nested `Scene.play` branches)
- **THEN** each frame carries the same metadata from the root scene and the single runner's settings

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
