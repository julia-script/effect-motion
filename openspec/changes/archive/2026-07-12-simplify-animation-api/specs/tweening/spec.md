# Spec: tweening (delta)

## MODIFIED Requirements

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
