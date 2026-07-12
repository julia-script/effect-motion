# Spec: tweening

## ADDED Requirements

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
