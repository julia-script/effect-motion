## ADDED Requirements

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
