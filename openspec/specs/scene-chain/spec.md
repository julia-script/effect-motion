# scene-chain Specification

## Purpose
TBD - created by archiving change add-schedule-composition. Update Purpose after archive.
## Requirements
### Requirement: Chain runs items sequentially, schedule consulted after completion
`Scene.chain(effects, schedule)` SHALL run the items one at a time in order and MUST NOT overlap them, mirroring Effect's guarantee for scheduled effects. The first item runs immediately; after each item completes, the schedule is stepped exactly once with the completion's scene time and the item's result as input, and the next item starts at the schedule's target.

#### Scenario: Spaced rests between items
- **WHEN** three 30-frame animations are chained with `Schedule.spaced("0.5 seconds")` at 60fps
- **THEN** item 2 starts 30 frames after item 1 completes, and item 3 starts 30 frames after item 2 completes

#### Scenario: Fixed cadence never overlaps
- **WHEN** items longer than the interval are chained with `Schedule.fixed`
- **THEN** items run back-to-back once the cadence falls behind, and never overlap

#### Scenario: Item results feed the schedule
- **WHEN** items are chained with an input-driven schedule that stops when an item's result satisfies a predicate
- **THEN** the chain stops advancing after the first item whose result satisfies it

### Requirement: Schedule exhaustion skips remaining items
When the schedule completes before all items have run, the remaining items SHALL NOT run. No schedule step is consumed after the last item. `Scene.chain` SHALL report how many items completed.

#### Scenario: Truncated chain
- **WHEN** `Scene.chain([a, b, c, d, e], schedule)` runs with a schedule allowing 2 recurrences
- **THEN** exactly a, b, and c run, d and e never run, and the result reports 3 completed

### Requirement: Chain without a schedule is plain sequential composition
`Scene.chain(effects)` with no schedule SHALL run all items in order with no added gaps.

#### Scenario: No schedule
- **WHEN** two 30-frame animations are chained without a schedule
- **THEN** the second starts on the frame after the first completes and the chain spans 60 frames

