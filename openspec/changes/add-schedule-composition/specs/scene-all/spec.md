# scene-all

## ADDED Requirements

### Requirement: Scene.all is the public parallel combinator
`Scene.all(effects)` without options SHALL behave identically to `Phaser.all`: run all effects in parallel sharing frame phases, resolving when all complete. `Phaser.all` remains available as the low-level API.

#### Scenario: Plain parallel
- **WHEN** `Scene.all([a, b, c])` runs with no options
- **THEN** a, b, and c animate concurrently, sharing frames, and `Scene.all` resolves when the last one finishes

### Requirement: Optional schedule staggers releases
With `{ schedule }`, `Scene.all` SHALL release the first effect immediately and release each subsequent effect on the schedule's next emission, evaluated in scene time. Released effects run concurrently.

#### Scenario: Staggered starts
- **WHEN** `Scene.all([a, b, c], { schedule: Schedule.spaced("500 millis") })` runs at 60fps
- **THEN** a starts at frame 0, b starts 30 frames later, c starts 30 frames after b, and all run concurrently once started

#### Scenario: Whole combinator completion
- **WHEN** all released effects have completed
- **THEN** `Scene.all` resolves (release pacing never delays completion of already-running effects)

### Requirement: Schedule exhaustion skips remaining effects
When the schedule completes before all effects have been released, the remaining effects SHALL NOT be run. The schedule is the release policy, including how many effects are released.

#### Scenario: Truncated release
- **WHEN** `Scene.all([a, b, c, d, e], { schedule: Schedule.recurs(2) })` runs
- **THEN** exactly a, b, and c are released (initial release plus 2 recurrences) and d, e never run

### Requirement: Truncation is observable
`Scene.all` SHALL report how many effects were released so callers can detect truncation.

#### Scenario: Release count
- **WHEN** the schedule truncates releases to 3 of 5 effects
- **THEN** the result reports 3 released
