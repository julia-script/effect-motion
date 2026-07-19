# scene-composition Delta Specification

## ADDED Requirements

### Requirement: A scene value carries its composition config
A scene value SHALL carry `width`, `height`, and `backgroundColor`, provided via `Scene.make(generator, meta?)` and defaulting to 1920, 1080, and transparent. `annotate`/`annotateMerge` copies SHALL share the same composition config. The config SHALL be readable by the runtime (unlike annotations).

#### Scenario: Defaults apply
- **WHEN** a scene is created with `Scene.make(gen)` and no meta
- **THEN** the scene value has width 1920, height 1080, and a transparent backgroundColor

#### Scenario: Explicit config
- **WHEN** a scene is created with `Scene.make(gen, { width: 800, height: 600, backgroundColor: c })`
- **THEN** the scene value carries those values

#### Scenario: Annotated copies share config
- **WHEN** a scene with explicit config is annotated
- **THEN** the returned scene carries the same width, height, and backgroundColor

### Requirement: The runner inherits the root scene's composition config
`Scene.run` and `Scene.stream` SHALL resolve resolution and background from the ROOT scene's composition config. `Runner.Settings` SHALL NOT accept `width`, `height`, or `backgroundColor`; it carries only playback settings (`frameRate`, `seed`, `maxFrames`). The default camera SHALL derive from the root scene's width.

#### Scenario: Root config drives the movie
- **WHEN** a scene with `{ width: 800, height: 600 }` is run with `{ frameRate: 30 }`
- **THEN** the movie renders at 800×600 at 30 fps

#### Scenario: Nested config does not resize the movie
- **WHEN** a root scene plays a child scene whose width and height differ from the root's
- **THEN** the movie's resolution and background remain the root scene's
