## MODIFIED Requirements

### Requirement: Spring combinators

`Physics.spring(instance, from, to, springInput?, settleTolerance?)` and `Physics.springTo(instance, to, springInput?, settleTolerance?)` SHALL spring-animate the instance's `position` field directly — origin from the explicit `from` (partial origins filled from the instance's current position) or entirely from the current position for `springTo` — writing the field each frame, supporting data-first and data-last (pipeable) forms, resolving with the instance, and defaulting to the general-purpose spring when none is given. Raw-prop spring animation is not part of the public API.

Applicability SHALL be enforced at compile time by constraining on the entity tag (see `entity-transform`); no runtime trait lookup SHALL occur. Because geometry is relative to `position`, springing an entity SHALL move it rigidly with no per-entity handling.

#### Scenario: springTo from the current position

- **WHEN** `instance.pipe(springTo({ x: 300 }, "swing"))` runs on an instance whose position is x = 100
- **THEN** the position springs from 100 to exactly 300 with swing physics, no origin specified by the caller

#### Scenario: spring takes an explicit origin

- **WHEN** `spring(instance, { x: 0 }, { x: 300 }, "plop")` runs on an instance positioned elsewhere
- **THEN** the simulation starts at position 0 and settles exactly on 300, applied to the position field each frame

#### Scenario: Springing a Line keeps it rigid

- **WHEN** `springTo(line, { x: 300 }, "swing")` runs on a Line
- **THEN** the whole line springs to the target position (both endpoints, no stretching) and settles exactly

#### Scenario: Spring physics unchanged

- **WHEN** an existing scene using spring combinators is run
- **THEN** its per-frame values and settle frame are unchanged by the removal of the lens layer
