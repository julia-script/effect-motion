# Spec: tweening (delta)

## MODIFIED Requirements

### Requirement: Spring combinators
`Physics.spring(instance, from, to, springInput?, settleTolerance?)` and `Physics.springTo(instance, to, springInput?, settleTolerance?)` SHALL spring-animate the instance's position through its `~position` trait lens — origin from the explicit `from` (partial origins filled from the lens's current value) or entirely from the lens for `springTo` — applying values via the lens's set each frame, supporting data-first and data-last (pipeable) forms, resolving with the instance, and defaulting to the general-purpose spring when none is given. Raw-prop spring animation is not part of the public API.

#### Scenario: springTo from the current position
- **WHEN** `instance.pipe(springTo({ x: 300 }, "swing"))` runs on an instance whose position is x = 100
- **THEN** the position springs from 100 to exactly 300 with swing physics, no origin specified by the caller

#### Scenario: spring takes an explicit origin
- **WHEN** `spring(instance, { x: 0 }, { x: 300 }, "plop")` runs on an instance positioned elsewhere
- **THEN** the simulation starts at position 0 and settles exactly on 300, applied through the position lens each frame
