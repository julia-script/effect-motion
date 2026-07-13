# scene-stagger Specification

## Purpose
TBD - created by archiving change add-schedule-composition. Update Purpose after archive.
## Requirements
### Requirement: Stagger is the explicit overlap opt-in
`Scene.stagger(effects, schedule)` SHALL release the first effect immediately and each subsequent effect on the schedule's next emission, evaluated in scene time. Released effects run concurrently — overlap is this combinator's purpose and is never the default of any other schedule-paced list combinator.

#### Scenario: Staggered overlapping starts
- **WHEN** three 60-frame animations are staggered with `Schedule.spaced("0.25 seconds")` at 60fps
- **THEN** they start at frames 0, 15, and 30 and animate concurrently once started

#### Scenario: Completion is not delayed by pacing
- **WHEN** all released effects have completed
- **THEN** `Scene.stagger` resolves (an infinite schedule adds no tail)

### Requirement: Schedule exhaustion skips remaining effects, observably
When the schedule completes before all effects are released, the remaining effects SHALL NOT run, and the result SHALL report how many were released.

#### Scenario: Truncated release
- **WHEN** `Scene.stagger([a, b, c, d, e], schedule)` runs with a schedule allowing 2 recurrences
- **THEN** exactly a, b, and c are released, d and e never run, and the result reports 3 released

