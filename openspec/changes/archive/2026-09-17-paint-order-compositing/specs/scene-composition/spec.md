## MODIFIED Requirements

### Requirement: A scene value carries its composition config
A scene value SHALL carry `width`, `height`, `backgroundColor`, and `compositing`, provided via `Scene.make(generator, meta?)` and defaulting to 1920, 1080, transparent, and `"paint"`. `compositing` SHALL be `"paint"` or `"depth"`; it SHALL be explicit metadata, never inferred from coordinates or camera state. `Scene.make` SHALL also accept an optional leading display name — `Scene.make(name, generator, meta?)` — carried on the scene value as `readonly name?: string`. The name is DISPLAY-ONLY (a picker label, never an identifier): unnamed scenes carry no name, and names are not required to be unique. The config SHALL be readable by the runtime.

#### Scenario: Defaults apply
- **WHEN** a scene is created with `Scene.make(gen)` and no meta
- **THEN** the scene value has width 1920, height 1080, a transparent backgroundColor, compositing `"paint"`, and no name

#### Scenario: Explicit config
- **WHEN** a scene is created with `Scene.make(gen, { width: 800, height: 600, backgroundColor: c })`
- **THEN** the scene value carries those values

#### Scenario: Named scene
- **WHEN** a scene is created with `Scene.make("The Grand Orbit", gen, { width: 800, height: 600 })`
- **THEN** the scene value carries `name: "The Grand Orbit"` alongside its composition config

#### Scenario: Name does not affect playback
- **WHEN** the same generator is made with and without a name
- **THEN** both scenes produce identical frames

#### Scenario: Explicit depth composition
- **WHEN** a scene is created with `compositing: "depth"`
- **THEN** it carries depth compositing independently of its current camera and child positions


### Requirement: The runner inherits the root scene's composition config
`Scene.run` and `Scene.stream` SHALL resolve resolution, background and compositing from the ROOT scene's composition config. `Runner.Settings` SHALL NOT accept `width`, `height`, `backgroundColor`, or `compositing`; it carries only playback settings (`frameRate`, `seed`, `maxFrames`). The default camera SHALL derive from the root scene's width.

#### Scenario: Root config drives the movie
- **WHEN** a scene with `{ width: 800, height: 600 }` is run with `{ frameRate: 30 }`
- **THEN** the movie renders at 800×600 at 30 fps

#### Scenario: Nested config does not resize the movie
- **WHEN** a root scene plays a child scene whose width and height differ from the root's
- **THEN** the movie's resolution and background remain the root scene's

#### Scenario: Compositing survives frame production and nesting
- **WHEN** a depth root scene plays a paint child scene
- **THEN** root frames retain depth compositing and the mounted child's composition metadata retains paint compositing
- **AND** replay and export use that metadata without a renderer-specific scene option
