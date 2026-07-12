# Spec: tweening (delta)

## ADDED Requirements

### Requirement: Spring configuration and presets
The library SHALL provide a `Spring` configuration (`mass`, `stiffness`, `damping`, optional `initialVelocity`) with named presets (`beat`, `plop`, `bounce`, `swing`, `jump`, `strike`, `smooth`), accepted anywhere a spring is expected either by preset name (typed key union) or as a `Spring` object. Invalid configurations (mass ≤ 0, stiffness < 0, damping < 0) and unknown preset names SHALL be defects.

#### Scenario: Preset by name
- **WHEN** `springTo(instance, to, "plop")` is called
- **THEN** the animation uses the plop preset's physics

#### Scenario: Custom spring object
- **WHEN** a `Spring` object with custom mass/stiffness/damping is passed
- **THEN** it works exactly as a preset name would

#### Scenario: Invalid configuration is a defect
- **WHEN** a spring with mass 0 is used
- **THEN** the animation dies with a defect rather than simulating garbage

### Requirement: Spring physics and settling
Spring animations SHALL simulate a damped harmonic oscillator per animated key (shared parameters, independent position/velocity), advancing one scene frame per tick with fixed 120 Hz substeps so trajectories are frame-rate independent. The animation SHALL end when every key's displacement and velocity are within the settle tolerance (default 0.001, overridable per call), and the final frame SHALL snap exactly onto the target. No duration is specified — length emerges from the physics; a spring that never settles (e.g. zero damping) animates indefinitely without blocking scene stepping.

#### Scenario: Settles exactly on the target
- **WHEN** a spring animation runs to completion
- **THEN** the animated value's final frame equals the target exactly, not approximately

#### Scenario: Underdamped springs overshoot
- **WHEN** a bouncy preset animates a value from 0 to 100
- **THEN** intermediate frames pass beyond 100 before settling back onto it

#### Scenario: Duration emerges from physics
- **WHEN** the same distance is animated with a stiff, well-damped spring and a loose one
- **THEN** the two animations take different numbers of frames, neither specified by the caller

### Requirement: Spring combinators
`Physics.spring(from, to, springInput, fn, settleTolerance?)` SHALL interpolate explicit-origin records through the spring simulation, calling `fn` once per frame. `Physics.springTo(instance, to, springInput?, settleTolerance?)` SHALL read the origin from the instance's current data, apply values via scene updates, support data-first and data-last (pipeable) forms, resolve with the instance, and default to the general-purpose spring when none is given.

#### Scenario: springTo from current data
- **WHEN** `instance.pipe(springTo({ x: 300 }, "swing"))` runs on an instance at x = 100
- **THEN** x is spring-animated from 100 to exactly 300 with swing physics, no origin specified by the caller

#### Scenario: spring drives a callback
- **WHEN** `spring({ v: 0 }, { v: 1 }, "smooth", fn)` runs
- **THEN** `fn` receives physically simulated values each frame, ending with exactly `{ v: 1 }`
