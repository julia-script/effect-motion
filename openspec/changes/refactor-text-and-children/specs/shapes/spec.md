## MODIFIED Requirements

### Requirement: Group container entity

The library SHALL ship a `Group` container entity with position (`x`, `y`), `opacity`, and `children` — an ordered array of instance ids held as ordinary schema data. Groups structure and position their children and paint nothing themselves. Structure SHALL be defined by children: a group's `children` input MAY be given as a polymorphic list (see the instance-children capability) that instantiation normalizes into stored ids, and instantiation SHALL NOT accept a `parent` argument on the child. Every new instance SHALL attach to its ambient parent group, defaulting to the root group (conventional id `"root"`). Destroying an instance SHALL remove its id from any group that references it. Because `children` is plain data, scene updates on a group MAY reparent and reorder children; paint order SHALL follow the children array order.

#### Scenario: Instances attach to the ambient parent by default

- **WHEN** an instance is created at the top level
- **THEN** its id is appended to the root group's children and it renders at top level, as in a flat scene

#### Scenario: Structure defined by children

- **WHEN** a `Group` is instantiated with `children: [child]` (or a string/effect that resolves to a child)
- **THEN** the resolved child's id is appended to that group's children and it renders inside the group

#### Scenario: Destroy detaches

- **WHEN** an instance referenced by a group is destroyed
- **THEN** its id is removed from that group's children and subsequent frames render without defects

#### Scenario: Reorder controls paint order

- **WHEN** a scene update reverses a group's children array
- **THEN** the rendered output emits the children in the new order

## ADDED Requirements

### Requirement: Uniform instance visibility

Every shape instance SHALL support the builtin `$visible` instance property (defined by the instance-visibility capability), held beside its data and defaulting to visible. SVG sinks MAY omit an instance whose `$visible` is `false` from their output.

#### Scenario: Hidden shape may be skipped

- **WHEN** a shape instance has `$visible: false`
- **THEN** an SVG sink is permitted to render nothing for it while other instances render normally
