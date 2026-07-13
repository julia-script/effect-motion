# schedule-driver Specification

## Purpose
TBD - created by archiving change add-schedule-composition. Update Purpose after archive.
## Requirements
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

### Requirement: Targets resolve to the first frame at or after them, without accumulated drift
The driver SHALL convert each absolute target time to the FIRST frame at or after it (ceiling), once per decision. A frame earlier than the target is forbidden: a decision made there happens before the schedule's boundary, and stateful schedules (e.g. `fixed`) re-emit the same boundary forever — a same-frame decision loop. Rounded frame deltas MUST NOT be accumulated across decisions.

#### Scenario: Non-frame-aligned schedule keeps cadence
- **WHEN** driving `Schedule.fixed("333 millis")` at 60fps for 10 decisions
- **THEN** each release frame equals `ceil(target * 60 / 1000)` of the schedule's own continuous target, with no cumulative drift

#### Scenario: Positive sub-frame delays land on the next frame
- **WHEN** a schedule emits a positive delay smaller than one frame
- **THEN** the target resolves to the next frame (never a frame before the schedule's target time)

#### Scenario: Zero delays are due in the current frame
- **WHEN** a schedule emits a zero delay (e.g. `fixed` catch-up when behind the cadence)
- **THEN** the decision resolves in the current frame without ticking

#### Scenario: Same-frame decisions make progress
- **WHEN** consecutive decisions are made at the resolved target frame of a non-frame-aligned `fixed` schedule
- **THEN** each decision's target is strictly later than the previous one (no wedged loop)

### Requirement: Schedule completion terminates the driver
The driver SHALL surface the schedule's "done" decision to callers so combinators can stop recurring.

#### Scenario: Finite schedule ends
- **WHEN** driving `Schedule.recurs(3)`
- **THEN** the driver reports done after the third recurrence and no further targets are produced

