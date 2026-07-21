# entity-transform Specification

## Purpose
TBD - created by archiving change close-the-entity-world. Update Purpose after archive.
## Requirements
### Requirement: Every entity carries a uniform transform and appearance

Every entity SHALL carry `position` and `rotation` as `Vec3` values defaulting to `(0, 0, 0)`.

Every **paintable** entity SHALL additionally carry:

- `scale` as a `Vec3` defaulting to `(1, 1, 1)`,
- `opacity` as a number defaulting to `1`,
- `visible` as a boolean defaulting to `true` (see `entity-model`).

`Camera` is the single non-paintable entity: it is view state, omitted from the frame's instance map, and never renders. It SHALL therefore carry `position` and `rotation` only. Scale, opacity, and visibility have no meaning for a viewpoint.

These fields SHALL be declared once as shared mixins, not restated per entity, so no entity can omit them or diverge in their naming or defaults.

#### Scenario: Default transform and appearance are identity

- **WHEN** any paintable entity is instantiated without transform or appearance fields
- **THEN** its `position` and `rotation` are `(0, 0, 0)`, its `scale` is `(1, 1, 1)`, its `opacity` is `1`, and its `visible` is `true`

#### Scenario: Shared fields are uniform across entities

- **WHEN** any two paintable entities are compared
- **THEN** both expose `position`, `rotation`, `scale`, `opacity`, and `visible` under the same names with the same shapes and defaults

#### Scenario: Every paintable entity can fade

- **WHEN** a fade animator is applied to any paintable entity
- **THEN** it compiles and animates that entity's `opacity`, with no entity lacking the field

#### Scenario: Camera carries neither scale, opacity, nor visibility

- **WHEN** a `Camera` is instantiated
- **THEN** it carries `position` and `rotation` and has no `scale`, `opacity`, or `visible` field

### Requirement: Geometry is relative to the entity's own position

An entity's geometry fields SHALL be expressed relative to its own `position`, never as absolute world coordinates. Specifically:

- `Line` SHALL carry `start` and `end` as `Vec3` offsets from its `position`. The absolute-endpoint fields `x2`/`y2`/`z2` are removed.
- `Path` SHALL carry `position`, and its `commands` coordinates SHALL be offsets from it.

Consequently, changing an entity's `position` SHALL translate its whole geometry rigidly, with no per-entity compensation logic anywhere in the system.

#### Scenario: Moving a Line does not stretch it

- **WHEN** a Line whose geometry spans a 50×20 offset is moved to position (100, 100)
- **THEN** it spans (100, 100) to (150, 120) — same length and direction

#### Scenario: Moving a Line in depth keeps it rigid

- **WHEN** a Line whose end offset carries z = 300 is moved to z = 100
- **THEN** its endpoints sit at z = 100 and z = 400 — same depth span

#### Scenario: Moving a Path leaves its commands untouched

- **WHEN** a Path's `position` is animated
- **THEN** the whole path translates rigidly on screen while its stored `commands` array is unchanged

#### Scenario: Rigid translation needs no per-entity handling

- **WHEN** any entity's `position` is animated
- **THEN** the translation is applied by writing `position` alone, with no branch on the entity's tag in any animator

### Requirement: Transforms compose down the tree

A parent's transform SHALL apply to its subtree: children SHALL be positioned, rotated, and scaled in their parent's local space. `Group` and `Hud` SHALL compose their children through the same transform every other entity carries — no container-specific transform representation SHALL exist.

The 2D affine matrix representation and its transform-operation input list are removed. Shear is consequently not expressible.

#### Scenario: Moving a Group moves its children

- **WHEN** a group's `position` animates
- **THEN** rendered children follow, their own local transforms unchanged

#### Scenario: Nested transforms compose

- **WHEN** a child sits inside a transformed group which itself sits inside a transformed group
- **THEN** the child renders under the composition of both ancestor transforms

#### Scenario: No container-specific transform

- **WHEN** a `Group`'s data is inspected
- **THEN** it carries the same `position`/`rotation`/`scale` fields as a leaf entity, and no affine matrix field

### Requirement: Animation targets only the channels the author names

An animator SHALL affect only the fields present in its target, and — for structured fields such as `position` — only the channels present. A field absent from the target SHALL be left untouched, not interpolated to its own current value. A channel absent from a structured target SHALL hold at its current value.

An animator SHALL NOT interpolate from an absent value: a target naming a channel with no current value SHALL fail loudly rather than produce `NaN` frames.

#### Scenario: Unnamed fields are untouched

- **WHEN** an entity carrying both `scale` and explicit dimensions is animated with a target naming only one of them
- **THEN** only the named field animates and the other is left entirely untouched

#### Scenario: Partial position targets hold the other axes

- **WHEN** an instance at (10, 20, 30) is moved with a target naming only `x`
- **THEN** `x` animates to the target while `y` holds at 20 and `z` at 30

#### Scenario: Individual position channels are addressable

- **WHEN** a target names any subset of `position`'s channels
- **THEN** exactly that subset animates

#### Scenario: Absent start value fails loudly

- **WHEN** an animation targets a channel that has no current value and no explicit origin
- **THEN** it fails loudly naming the channel, rather than emitting `NaN` frames

### Requirement: Semantic animators target fields, not traits

Semantic animators (`move`/`moveTo`, `fade`/`fadeTo`, `spring`/`springTo`) SHALL read and write the entity's schema fields directly — `position` and `opacity` — with no intermediate lens layer.

Their applicability SHALL be enforced at compile time by constraining on the entity tag: an animator requiring a field SHALL NOT accept an instance whose tag lacks it. Runtime trait-absence checks are removed, being unreachable.

Their observable behavior — easing, exact final frame, spring settling, dual call forms, resolving with the instance — SHALL be unchanged.

#### Scenario: Animator rejects an entity lacking the field

- **WHEN** a fade animator is applied to a `Camera`, which carries no `opacity` field
- **THEN** compilation fails, naming the missing field

#### Scenario: No runtime trait check remains

- **WHEN** any semantic animator runs
- **THEN** it performs no trait lookup and can raise no trait-absence defect

#### Scenario: Behavior is unchanged

- **WHEN** an existing scene using semantic animators is run
- **THEN** its per-frame values are unchanged by the removal of the lens layer

