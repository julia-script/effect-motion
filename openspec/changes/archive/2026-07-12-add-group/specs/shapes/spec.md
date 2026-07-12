# Spec: shapes (delta)

## ADDED Requirements

### Requirement: Group container entity
The library SHALL ship a `Group` container entity with position (`x`, `y`), `opacity`, and `children` — an ordered array of instance ids held as ordinary schema data. Groups structure and position their children and paint nothing themselves. Instantiation SHALL attach every new instance to a parent group (an optional `parent` argument, defaulting to the root group, whose conventional id is `"root"`), and destroying an instance SHALL remove its id from any group that references it. Because `children` is plain data, scene updates on a group MAY reparent and reorder children; paint order SHALL follow the children array order.

#### Scenario: Instances attach to the root by default
- **WHEN** an instance is created without a parent
- **THEN** its id is appended to the root group's children and it renders at top level, as in a flat scene

#### Scenario: Instances attach to a given parent group
- **WHEN** an instance is created with `{ parent: group }`
- **THEN** its id is appended to that group's children and it renders inside the group

#### Scenario: Destroy detaches
- **WHEN** an instance referenced by a group is destroyed
- **THEN** its id is removed from that group's children and subsequent frames render without defects

#### Scenario: Reorder controls paint order
- **WHEN** a scene update reverses a group's children array
- **THEN** the rendered output emits the children in the new order
