## MODIFIED Requirements

### Requirement: Built-in shapes implement semantic traits
Built-in shapes SHALL implement `~position` and `~opacity` with per-entity semantics: most shapes map position to `x`/`y`; Line's position SHALL translate the whole line rigidly in all three axes (both endpoints move together — `set` shifts `x2`/`y2`/`z2` by the position delta, get returning the start point); Group's position SHALL move the subtree via its transform.

#### Scenario: Moving a Line does not stretch it
- **WHEN** a Line from (0, 0) to (50, 20) is moved to position (100, 100) via its position trait
- **THEN** it spans (100, 100) to (150, 120) — same length and direction

#### Scenario: Moving a Line in depth keeps it rigid
- **WHEN** a Line from (0, 0, 0) to (50, 20, 300) is moved to z = 100 via its position trait
- **THEN** its endpoints sit at z = 100 and z2 = 400 — same depth span

#### Scenario: Moving a Group moves its children
- **WHEN** a group's position trait animates
- **THEN** rendered children follow (their local coordinates unchanged)
