## MODIFIED Requirements

### Requirement: Group container entity

The library SHALL ship a `Group` container entity carrying the uniform transform and appearance fields (see `entity-transform`) plus `children` — an ordered array of instance ids held as ordinary schema data. A group's `opacity` SHALL apply to its subtree. A Group SHALL additionally carry `compositing: "inherit" | "paint"`, defaulting to `"inherit"`. Inherited groups participate in the enclosing context; explicit paint groups isolate their descendants as one 2D surface and apply group opacity to that composite.

A `Group` SHALL NOT carry composition bounds. The `width`, `height`, and `backgroundColor` fields are removed: they duplicated values a `Scene` already owns, written only by `Scene.play` when mounting a nested scene. Composition bounds SHALL reach the renderer from the scene that declares them, and a subtree's status as a mounted composition SHALL be signalled explicitly rather than inferred from a group happening to carry a size. A `Group` SHALL position its children by composing its transform down the subtree, using the same transform representation every other entity carries; it SHALL NOT carry an affine matrix field or accept a transform-operation list.

Groups structure and position their children without an authored shape of their own; an explicit paint group is represented externally by its subtree's composited surface. Structure SHALL be defined by children: a group's `children` input MAY be given as a polymorphic list (see the instance-children capability) that instantiation normalizes into stored ids, and instantiation SHALL NOT accept a `parent` argument on the child. Every new instance SHALL attach to its ambient parent group, defaulting to the root group (conventional id `"root"`). Destroying an instance SHALL remove its id from any group that references it. Because `children` is plain data, scene updates on a group MAY reparent and reorder children; paint order inside a paint context SHALL follow the children array order; physically distinct depths in a depth context SHALL follow depth-render-order.

The library SHALL additionally ship a `Hud` screen-space container under its own tag, carrying the same uniform transform and appearance fields plus `children`. Its `position.z` SHALL mean depth **within the HUD tier** (screen space), not world depth — `z` consistently means depth within the entity's own coordinate space. A `Hud` SHALL remain a top-level child of the root (or of another `Hud`); nesting one inside world content remains a loud defect.

#### Scenario: Group transforms like any entity

- **WHEN** a Group's transform is set or animated
- **THEN** its subtree is positioned by composing that transform, and its stored data carries no affine matrix

#### Scenario: Nested scenes keep their bounds

- **WHEN** a scene is mounted inside another via `Scene.play`
- **THEN** the child's subtree is clipped to the child scene's own bounds and painted with its own background, sourced from the scene rather than copied onto the mount group

#### Scenario: A group with a size is not a composition

- **WHEN** a `Group` is inspected
- **THEN** it carries no `width`, `height`, or `backgroundColor`, and composition status is never inferred from field presence

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

- **WHEN** a scene update reverses a group's children array inside a paint context
- **THEN** the rendered output emits the children in the new order

#### Scenario: Hud is a distinct tag

- **WHEN** a `Hud` and a `Group` are compared
- **THEN** both carry the uniform transform, appearance fields, and `children`, differing in `_tag` — which is what renderers dispatch on to place the subtree in the screen-space tier

#### Scenario: Hud depth orders within the HUD tier

- **WHEN** a `Hud`'s `position.z` is set
- **THEN** it contributes depth within screen space, ordering HUD content against other HUD content, and never moves the subtree in world depth

#### Scenario: Default Hud renders as before

- **WHEN** a `Hud` sets no `z`
- **THEN** its depth is 0 and its subtree renders exactly as it did when `Hud` had no depth field at all

#### Scenario: Group chooses paint composition without bounds
- **WHEN** a Group is instantiated with `compositing: "paint"`
- **THEN** it establishes a paint context using its existing children array
- **AND** it needs no public width, height, background or second content tree

#### Scenario: Default group inherits its context
- **WHEN** a Group omits compositing
- **THEN** its mode is inherit and it follows its nearest enclosing composition context
