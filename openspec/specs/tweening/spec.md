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
`Motion.tween(from, to, duration, fn, timing?)` SHALL interpolate each key from the explicit `from` to `to` over the duration's frame count, calling `fn` once per frame with values computed at the eased progress `f(i / frames)`, ticking the scene each step. `Motion.tweenTo(instance, to, duration, fn, timing?)` SHALL behave identically but read the origin from the instance's current data at the keys of `to`, support both data-first and data-last (pipeable) forms, and resolve with the instance. The default timing SHALL be linear. The final frame SHALL receive exactly `to` for any timing with f(1) = 1; eased values outside [0, 1] mid-animation SHALL extrapolate rather than clamp.

#### Scenario: Easing changes pacing, not endpoints
- **WHEN** the same tween runs with "linear" and with "easeInQuad"
- **THEN** midpoint frames differ (easeInQuad lags below linear) while the final frame is identical and exact

#### Scenario: Overshoot extrapolates
- **WHEN** a tween runs with "easeOutBack" (which exceeds 1 mid-curve)
- **THEN** intermediate values pass beyond the target and settle exactly on it at the final frame

#### Scenario: tweenTo reads the origin from the instance
- **WHEN** `instance.pipe(tweenTo({ x: 200 }, duration, fn))` runs on an instance currently at x = 100
- **THEN** `fn` receives values interpolated from 100 to 200 without the caller specifying the origin

### Requirement: Timing on motion combinators
`moveTo` and `move` SHALL accept an optional trailing timing argument (name or function, default linear) in both their data-first and data-last (pipeable) forms, dispatching between the forms by inspecting whether the first argument is an Instance.

#### Scenario: Data-first with timing
- **WHEN** `move(instance, from, to, duration, "easeOutBounce")` is called
- **THEN** it animates from the explicit start with bounce pacing

#### Scenario: Data-last with timing
- **WHEN** `instance.pipe(moveTo(to, duration, "easeInExpo"))` is called
- **THEN** the piped form applies the easing identically to the data-first form

#### Scenario: Omitted timing stays linear
- **WHEN** `moveTo(instance, to, duration)` is called without a timing argument
- **THEN** behavior is identical to the pre-tweening linear interpolation

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
