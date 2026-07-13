# scene-repeat

## ADDED Requirements

### Requirement: Repeat an effect on a schedule in scene time
`Scene.repeat(effect, schedule)` SHALL run `effect`, then repeat it according to `schedule` evaluated in scene time, completing when the schedule is done. The first run SHALL be immediate; the schedule paces the gaps after runs.

#### Scenario: Spaced repetition
- **WHEN** a 30-frame animation is repeated with `Schedule.spaced("1 second")` at 60fps
- **THEN** each subsequent run starts 60 frames after the previous run *completed* (90-frame period)

#### Scenario: Fixed cadence catch-up without overlap
- **WHEN** an animation longer than the interval is repeated with `Schedule.fixed`
- **THEN** runs never overlap, and once the cadence falls behind, subsequent runs start immediately after the previous run completes (the cadence anchors at the first run's completion, per Effect's `fixed` semantics)

#### Scenario: Finite schedule
- **WHEN** an effect is repeated with `Schedule.recurs(2)`
- **THEN** the effect runs exactly 3 times (initial run plus 2 recurrences) and `Scene.repeat` then completes

### Requirement: Effect output feeds the schedule
`Scene.repeat` SHALL pass each run's result as the schedule's input, mirroring `Effect.repeat`.

#### Scenario: Value-dependent recurrence
- **WHEN** an effect returning `n` is repeated with an input-driven schedule that recurs while `n < 3` (e.g. `Schedule.collectWhile` on the metadata input)
- **THEN** repetition stops after the first run whose result is >= 3

### Requirement: Failures propagate immediately
If a run of the effect fails, `Scene.repeat` SHALL fail with that error without consulting the schedule again.

#### Scenario: Failing run
- **WHEN** the second run of the effect fails
- **THEN** `Scene.repeat` fails with that error and no third run starts
