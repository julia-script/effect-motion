# frame-metadata Delta Specification

## RENAMED Requirements

- FROM: `### Requirement: Runner settings define scene resolution`
- TO: `### Requirement: The root scene defines scene resolution`

## MODIFIED Requirements

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
