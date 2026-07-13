# Spec: traits

## ADDED Requirements

### Requirement: Lens-shaped entity traits, all-or-nothing
Entities SHALL declare optional trait lenses at definition time — per trait key, a single object with both `get: (data) => Value` and `set: (data, value) => Data` where `set` returns a new immutable data value with the change applied. A trait SHALL be implementable only as the complete pair; entities MAY omit any trait entirely. Initial keys: `~position` (`{x, y}`) and `~opacity` (number).

#### Scenario: Complete pair or nothing
- **WHEN** an entity declares a trait
- **THEN** both get and set are present (a lone getter or setter does not typecheck)

#### Scenario: Set is whole-data and immutable
- **WHEN** a trait's set is applied
- **THEN** it returns a new data value and the previous data is unchanged

### Requirement: Built-in shapes implement semantic traits
Built-in shapes SHALL implement `~position` and `~opacity` with per-entity semantics: most shapes map position to `x`/`y`; Line's position SHALL translate the whole line (both endpoints move together, get returning the start point); Group's position SHALL move the subtree via its transform.

#### Scenario: Moving a Line does not stretch it
- **WHEN** a Line from (0, 0) to (50, 20) is moved to position (100, 100) via its position trait
- **THEN** it spans (100, 100) to (150, 120) — same length and direction

#### Scenario: Moving a Group moves its children
- **WHEN** a group's position trait animates
- **THEN** rendered children follow (their local coordinates unchanged)

### Requirement: Trait detection
Helpers requiring a trait SHALL constrain on the instance's entity traits at the type level (calling them on an entity without the trait fails compilation for typed consumers) and SHALL die at runtime with a defect naming the entity and trait key when the trait is absent.

#### Scenario: Missing trait is loud
- **WHEN** a trait helper is invoked on an instance whose entity lacks the trait (e.g. from untyped code)
- **THEN** it dies with a defect naming the entity and the trait key

### Requirement: Trait-based helper families
Every semantic helper SHALL animate through its trait's lens — origin via `get` (base forms take an explicit origin, with `get` filling partial origins), values applied via `set` each frame — in base/To pairs supporting data-first and data-last (pipeable) forms and resolving with the instance:
- `Motion.move(instance, from, to, duration, timing?)` and `Motion.moveTo(instance, to, duration, timing?)` via `~position`, eased (standard timing input, exact final frame, partial targets hold the missing axis).
- `Motion.fade(instance, from, to, duration, timing?)` and `Motion.fadeTo(instance, to, duration, timing?)` via `~opacity`, eased.
- `Physics.spring(instance, from, to, springInput?, settleTolerance?)` and `Physics.springTo(instance, to, springInput?, settleTolerance?)` via `~position`, spring-simulated (settle-exact).

#### Scenario: moveTo via the trait
- **WHEN** `instance.pipe(moveTo({ x: 200 }, "1 second", "easeInOutCubic"))` runs
- **THEN** the position animates from the lens's current value to x = 200 (y held), eased, ending exactly on target

#### Scenario: fadeTo via the trait
- **WHEN** `fadeTo(instance, 0, "1 second")` runs on an entity with the opacity trait
- **THEN** opacity animates from its current value to exactly 0

#### Scenario: spring family rides the same lens
- **WHEN** `springTo(line, { x: 300 }, "swing")` runs on a Line
- **THEN** the whole line springs to the target position (both endpoints, no stretching) and settles exactly
