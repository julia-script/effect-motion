# schedule-driver

## ADDED Requirements

### Requirement: Schedules are evaluated in scene time
The driver SHALL feed Effect Schedules scene time in milliseconds, computed as `frameCount * 1000 / frameRate`, never wall-clock time.

#### Scenario: Scene time input
- **WHEN** a schedule decision is requested at frame 90 with a 60fps runner
- **THEN** the schedule step function is called with `now = 1500`

### Requirement: One step call per decision
The driver SHALL call the schedule's step function exactly once per decision, at the moment of the decision, and MUST NOT poll it per frame. The returned target time is stored and compared against scene time on subsequent frames.

#### Scenario: Relative schedules are not corrupted by polling
- **WHEN** driving `Schedule.spaced("1 second")` at 60fps
- **THEN** the step function is invoked once per gap (not 60 times), and the gap spans 60 frames

### Requirement: Targets round to frames without accumulated drift
The driver SHALL convert each absolute target time to a frame index by rounding that target once. Rounded frame deltas MUST NOT be accumulated across decisions.

#### Scenario: Non-frame-aligned schedule keeps cadence
- **WHEN** driving `Schedule.fixed("333 millis")` at 60fps for 10 decisions
- **THEN** each release frame equals `round(target * 60 / 1000)` of the schedule's own continuous target, with no cumulative drift

#### Scenario: Sub-frame gaps release within the same frame
- **WHEN** a schedule emits a target earlier than or equal to the current scene time
- **THEN** the decision resolves without ticking a frame

### Requirement: Schedule completion terminates the driver
The driver SHALL surface the schedule's "done" decision to callers so combinators can stop recurring.

#### Scenario: Finite schedule ends
- **WHEN** driving `Schedule.recurs(3)`
- **THEN** the driver reports done after the third recurrence and no further targets are produced
