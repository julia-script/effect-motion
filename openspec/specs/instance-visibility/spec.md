# instance-visibility Specification

## Purpose
TBD - created by syncing change refactor-text-and-children. Update Purpose after review.
## Requirements
### Requirement: Builtin instance visibility

Every entity SHALL carry a `visible` boolean field, declared as an ordinary schema field on every member of the entity union rather than held beside the data. `visible` SHALL default to `true`. It MAY be set at instantiation via the `visible` key in the entity's input, and MAY be updated and animated like any other data field. Because the field comes from a shared mixin applied to every union member, every entity SHALL support it uniformly.

Renderers MAY skip an instance whose `visible` is `false`; whether a hidden instance is omitted from output or emitted-but-hidden is a per-renderer choice, and the engine SHALL make the field available on every frame so any renderer can decide.

#### Scenario: Default visible

- **WHEN** an instance is created with no `visible` key
- **THEN** its `visible` field is `true`

#### Scenario: Set hidden at instantiation

- **WHEN** an instance is created with `{ visible: false }`
- **THEN** its `visible` field is `false`, stored as ordinary entity data

#### Scenario: Visibility is available to renderers per frame

- **WHEN** a frame is produced
- **THEN** each instance's `visible` value is readable directly from its entity data so a renderer can skip or hide it

#### Scenario: Visibility is ordinary data

- **WHEN** a scene update or animation targets `visible`
- **THEN** it behaves as any other entity-data field, with no engine-owned special casing

