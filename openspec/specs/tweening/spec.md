# tweening Specification

## Purpose
TBD - created by syncing change add-tweening. Update Purpose after review.
## Requirements
### Requirement: Timing-function library
The library SHALL ship the standard timing-function set as `(t: number) => number` functions: `linear`, `sin`, `cos`, the families `Sine`, `Quad`, `Cubic`, `Quart`, `Quint`, `Expo`, `Circ` (each as easeIn/easeOut/easeInOut), parameterized factories for `Back`, `Elastic`, and `Bounce` (easeIn/easeOut/easeInOut each), and the factories' default instances. Every non-periodic easing SHALL satisfy f(0) = 0 and f(1) = 1.

#### Scenario: Endpoints are exact
- **WHEN** any named easing (excluding the periodic `sin`/`cos`) is evaluated at 0 and 1
- **THEN** it returns 0 and 1 respectively

#### Scenario: Factories accept shape parameters
- **WHEN** `createEaseInBack(s)` is called with a custom overshoot
- **THEN** the returned function differs from the default `easeInBack` mid-curve while keeping exact endpoints

### Requirement: Timing input by name or function
Every timing parameter SHALL accept either the name of a built-in timing function (typed as the registry's key union, so names autocomplete and typos fail compilation) or a custom `(t: number) => number` function. Unknown names at runtime SHALL be a defect.

#### Scenario: By name
- **WHEN** `moveTo(instance, to, duration, "easeInOutCubic")` is called
- **THEN** interpolation is paced by the built-in easeInOutCubic curve

#### Scenario: By function
- **WHEN** a custom function `(t) => t * t` is passed as the timing argument
- **THEN** interpolation is paced by it exactly as a built-in would be

### Requirement: Eased per-frame tweening
`Motion.tween(instance, from, to, duration, timing?)` SHALL interpolate the keys of `to` from the explicit `from` (keys missing in `from` start at the instance's current data) over the duration's frame count, applying values to the instance via scene updates once per frame at the eased progress `f(i / frames)`, ticking the scene each step. `Motion.tweenTo(instance, to, duration, timing?)` SHALL behave identically but read the origin entirely from the instance's current data. Both SHALL support data-first and data-last (pipeable) forms and resolve with the instance. The default timing SHALL be linear. The final frame SHALL land exactly on `to` for any timing with f(1) = 1; eased values outside [0, 1] mid-animation SHALL extrapolate rather than clamp.

#### Scenario: Easing changes pacing, not endpoints
- **WHEN** the same tween runs with "linear" and with "easeInQuad"
- **THEN** midpoint frames differ (easeInQuad lags below linear) while the final frame is identical and exact

#### Scenario: Overshoot extrapolates
- **WHEN** a tween runs with "easeOutBack" (which exceeds 1 mid-curve)
- **THEN** intermediate values pass beyond the target and settle exactly on it at the final frame

#### Scenario: tweenTo reads the origin from the instance
- **WHEN** `instance.pipe(tweenTo({ x: 200 }, duration))` runs on an instance currently at x = 100
- **THEN** x animates from 100 to exactly 200 without the caller specifying the origin

#### Scenario: tween takes an explicit origin
- **WHEN** `tween(instance, { x: 0 }, { x: 100 }, duration)` runs on an instance currently elsewhere
- **THEN** the animation starts from 0, not from the current position

### Requirement: Timing on motion combinators
`tween` and `tweenTo` SHALL accept an optional trailing timing argument (name or function, default linear) in both their data-first and data-last (pipeable) forms, dispatching between the forms by inspecting whether the first argument is an Instance.

#### Scenario: Data-first with timing
- **WHEN** `tween(instance, from, to, duration, "easeOutBounce")` is called
- **THEN** it animates from the explicit start with bounce pacing

#### Scenario: Data-last with timing
- **WHEN** `instance.pipe(tweenTo(to, duration, "easeInExpo"))` is called
- **THEN** the piped form applies the easing identically to the data-first form

#### Scenario: Omitted timing stays linear
- **WHEN** `tweenTo(instance, to, duration)` is called without a timing argument
- **THEN** interpolation is linear

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

`Physics.spring(instance, from, to, springInput?, settleTolerance?)` and `Physics.springTo(instance, to, springInput?, settleTolerance?)` SHALL spring-animate the instance's `position` field directly — origin from the explicit `from` (partial origins filled from the instance's current position) or entirely from the current position for `springTo` — writing the field each frame, supporting data-first and data-last (pipeable) forms, resolving with the instance, and defaulting to the general-purpose spring when none is given. Raw-prop spring animation is not part of the public API.

Applicability SHALL be enforced at compile time by constraining on the entity tag (see `entity-transform`); no runtime trait lookup SHALL occur. Because geometry is relative to `position`, springing an entity SHALL move it rigidly with no per-entity handling.

#### Scenario: springTo from the current position

- **WHEN** `instance.pipe(springTo({ x: 300 }, "swing"))` runs on an instance whose position is x = 100
- **THEN** the position springs from 100 to exactly 300 with swing physics, no origin specified by the caller

#### Scenario: spring takes an explicit origin

- **WHEN** `spring(instance, { x: 0 }, { x: 300 }, "plop")` runs on an instance positioned elsewhere
- **THEN** the simulation starts at position 0 and settles exactly on 300, applied to the position field each frame

#### Scenario: Springing a Line keeps it rigid

- **WHEN** `springTo(line, { x: 300 }, "swing")` runs on a Line
- **THEN** the whole line springs to the target position (both endpoints, no stretching) and settles exactly

#### Scenario: Spring physics unchanged

- **WHEN** an existing scene using spring combinators is run
- **THEN** its per-frame values and settle frame are unchanged by the removal of the lens layer

### Requirement: Parametric drive animator

`Motion.drive` SHALL be a public animator taking an instance, a duration, a timing input, and a callback `(t, data) => data`: each frame it applies the callback with the eased parameter and ticks. The final frame SHALL receive exactly `t = 1` for any timing with `f(1) = 1`; a zero-length duration SHALL still take one frame. It SHALL ship as a dual (data-first and pipeable, dispatched by `Instance.isInstance` on the first argument). Determinism invariants apply: the callback receives only `(t, data)` — no wall-clock, no ambient randomness.

#### Scenario: Coordinated multi-field motion

- **WHEN** a scene drives an instance along a circular arc via `drive(instance, "1 second", "linear", (t, d) => ({ ...d, x: cx + r * Math.cos(t * a), y: cy + r * Math.sin(t * a) }))`
- **THEN** both fields update together each frame from the single eased parameter

#### Scenario: Lands exactly at t = 1

- **WHEN** a drive completes under any non-periodic easing
- **THEN** the last applied update received `t = 1` exactly

#### Scenario: Dual call forms

- **WHEN** called as `drive(instance, ...)` or piped as `instance.pipe(drive(...))`
- **THEN** both forms behave identically

