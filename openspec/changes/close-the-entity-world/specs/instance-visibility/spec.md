## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Reserved `$` namespace on entity fields

**Reason**: The reserved namespace existed to keep user-declared entity fields from colliding with engine-owned instance properties. With the entity union closed (see `entity-model`), there are no user-declared fields and therefore no collision to prevent. The validation it required lived in `Entity.make`, which is itself removed.

**Migration**: The sole engine-owned property, visibility, becomes a plain `visible` field on every entity. Note this supersedes a live drift between spec and implementation: the spec required `$visible` held beside the data while the code implemented `~visible` inside it. Neither form survives — consumers reading either name read `visible` instead.
