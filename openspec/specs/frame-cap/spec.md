# frame-cap Specification

## Purpose
TBD - created by archiving change add-schedule-composition. Update Purpose after archive.
## Requirements
### Requirement: Frame production is bounded by default
`Runner.Settings` SHALL include `maxFrames` with a finite default (36_000 — 10 minutes at 60fps). `Scene.step` SHALL count frames delivered and fail once the count exceeds `maxFrames`.

#### Scenario: Runaway scene fails instead of hanging
- **WHEN** a scene whose body never completes is stepped past `maxFrames` frames
- **THEN** `Scene.step` fails with an error that names the `maxFrames` setting and its current value

#### Scenario: Finite scenes are unaffected
- **WHEN** a scene completes in fewer frames than `maxFrames`
- **THEN** behavior is identical to today (stream ends normally, no error)

### Requirement: Infinity is the explicit infinite-scene opt-in
Setting `maxFrames: Infinity` SHALL disable the cap entirely. No other opt-in mechanism (scene constructor, flag) is introduced.

#### Scenario: Explicit infinite scene
- **WHEN** a scene runs with `{ maxFrames: Infinity }`
- **THEN** `Scene.step` never fails due to frame count

#### Scenario: Raised cap
- **WHEN** a scene runs with `{ maxFrames: 100_000 }`
- **THEN** the cap applies at the configured value instead of the default

