# scene-composition Specification (delta)

## MODIFIED Requirements

### Requirement: A scene value carries its composition config
A scene value SHALL carry `width`, `height`, and `backgroundColor`, provided via `Scene.make(generator, meta?)` and defaulting to 1920, 1080, and transparent. `Scene.make` SHALL also accept an optional leading display name — `Scene.make(name, generator, meta?)` — carried on the scene value as `readonly name?: string`. The name is DISPLAY-ONLY (a picker label, never an identifier): unnamed scenes carry no name, and names are not required to be unique. The config SHALL be readable by the runtime.

#### Scenario: Defaults apply
- **WHEN** a scene is created with `Scene.make(gen)` and no meta
- **THEN** the scene value has width 1920, height 1080, a transparent backgroundColor, and no name

#### Scenario: Explicit config
- **WHEN** a scene is created with `Scene.make(gen, { width: 800, height: 600, backgroundColor: c })`
- **THEN** the scene value carries those values

#### Scenario: Named scene
- **WHEN** a scene is created with `Scene.make("The Grand Orbit", gen, { width: 800, height: 600 })`
- **THEN** the scene value carries `name: "The Grand Orbit"` alongside its composition config

#### Scenario: Name does not affect playback
- **WHEN** the same generator is made with and without a name
- **THEN** both scenes produce identical frames
