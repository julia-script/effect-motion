## MODIFIED Requirements

### Requirement: Lens-shaped entity traits, all-or-nothing

Entities SHALL declare optional trait lenses at definition time — per trait key, a single object with both `get: (data) => Value` and `set: (data, value) => Data` where `set` returns a new immutable data value with the change applied. A trait SHALL be implementable only as the complete pair; entities MAY omit any trait entirely. Initial keys: `~position` (`{x, y, z}`) and `~opacity` (number).

#### Scenario: Complete pair or nothing

- **WHEN** an entity declares a trait
- **THEN** both get and set are present (a lone getter or setter does not typecheck)

#### Scenario: Set is whole-data and immutable

- **WHEN** a trait's set is applied
- **THEN** it returns a new data value and the previous data is unchanged

### Requirement: Built-in shapes implement semantic traits

Built-in shapes SHALL implement `~position` (`{x, y, z}`) and `~opacity` with per-entity semantics: most shapes map position to `x`/`y`/`z` with `z` defaulting to `0`; Line's position SHALL translate the whole line (both endpoints move together in x/y, get returning the start point); Group's position SHALL move the subtree via its position, offsetting descendants in all three axes (children keep local coordinates). The `~position` value SHALL include `z` so a single `moveTo`/`spring` animates depth alongside x/y, and a partial target (e.g. `{x}`) SHALL hold the unspecified axes including `z`.

#### Scenario: Moving a Line does not stretch it

- **WHEN** a Line from (0, 0) to (50, 20) is moved to position (100, 100) via its position trait
- **THEN** it spans (100, 100) to (150, 120) — same length and direction

#### Scenario: Moving a Group moves its children in depth too

- **WHEN** a group's position trait animates its `z`
- **THEN** rendered children follow in depth (their local coordinates unchanged), re-sorting against the rest of the scene

#### Scenario: A partial move holds the unspecified axes

- **WHEN** `moveTo({ x: 400 })` is applied to an entity at `{x: 0, y: 10, z: 200}`
- **THEN** the entity animates x to 400 while `y` stays `10` and `z` stays `200`
