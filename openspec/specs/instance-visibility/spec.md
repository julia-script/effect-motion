# instance-visibility Specification

## Purpose
TBD - created by syncing change refactor-text-and-children. Update Purpose after review.

## Requirements

### Requirement: Builtin instance visibility

Every instance SHALL carry a builtin, engine-owned visibility property named `$visible`, held BESIDE the entity's schema data rather than as a field of the entity's data. `$visible` SHALL default to `true`. It MAY be set at instantiation via the `$visible` key in the entity's input. Because `$visible` lives beside the data, every entity SHALL support it uniformly without declaring it in its schema.

Renderers MAY skip an instance whose `$visible` is `false`; whether a hidden instance is omitted from output or emitted-but-hidden is a per-renderer choice, and the engine SHALL make the property available on every frame so any renderer can decide.

#### Scenario: Default visible

- **WHEN** an instance is created with no `$visible` key
- **THEN** its builtin `$visible` is `true`

#### Scenario: Set hidden at instantiation

- **WHEN** an instance is created with `{ $visible: false }`
- **THEN** its builtin `$visible` is `false` and the value is not stored as an entity-data field

#### Scenario: Visibility is available to renderers per frame

- **WHEN** a frame is produced
- **THEN** each instance's `$visible` value is available alongside its data so a renderer can skip or hide it

### Requirement: Reserved `$` namespace on entity fields

`Entity.make` SHALL reject any entity whose schema declares a field whose name begins with `$`. The `$` prefix is reserved for builtin, engine-owned instance properties (such as `$visible`), so entity-data fields SHALL NOT collide with them.

#### Scenario: `$`-prefixed field is rejected

- **WHEN** `Entity.make` is called with a schema containing a field named `$visible` (or any `$`-prefixed name)
- **THEN** it fails loudly, naming the offending field

#### Scenario: Ordinary fields are unaffected

- **WHEN** `Entity.make` is called with a schema whose fields have no `$` prefix
- **THEN** the entity is created normally
