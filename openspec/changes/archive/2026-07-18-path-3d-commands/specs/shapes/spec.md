## ADDED Requirements

### Requirement: Path command geometry
The `Path` entity SHALL define its geometry as `commands`: a non-empty array of tagged command structs — `M` (move to) and `L` (line to), each carrying `x`, `y`, and an optional `z` treated as 0 when absent, and `Z` (close subpath) — replacing the former SVG `d` string, which is removed without a migration path. Command coordinates SHALL be local to the path's anchor (`x`/`y`/`z`): the `~position` trait moves the anchor and SHALL NOT rewrite the command array. The first command MUST be `M`; violating input SHALL fail loudly at instantiation. Curve and arc commands are not part of this vocabulary (deferred to a later iteration).

#### Scenario: The d string is gone
- **WHEN** a `Path` is instantiated with a `d` property
- **THEN** the schema rejects it — `commands` is the only geometry input

#### Scenario: First command must be a move
- **WHEN** a `Path` is instantiated whose first command is `L` or `Z`
- **THEN** instantiation fails loudly naming the invalid input

#### Scenario: Anchor moves, commands untouched
- **WHEN** a `Path` is moved via `Motion.moveTo` (the `~position` trait)
- **THEN** the whole path translates rigidly on screen while its stored `commands` array is unchanged

#### Scenario: Flat path preserves plain-2D output
- **WHEN** a `Path` whose commands carry no `z` renders under the resting camera
- **THEN** its output is identical to plain-2D rendering of the same polyline (identity invariant)

#### Scenario: Per-point depth
- **WHEN** a `Path` command point sets a nonzero `z`
- **THEN** that point projects with its own perspective position and scale while other points are unaffected
