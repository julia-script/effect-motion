## MODIFIED Requirements

### Requirement: Instantiation default parent comes from context

`Scene.instantiate` SHALL resolve its parent from an ambient current-parent service that defaults to the runner's root group. `Scene.instantiate` SHALL NOT accept an explicit `options.parent` argument — structure is defined by an entity's `children`, not by naming a parent at the child's callsite. The ambient current-parent remains the mount mechanism (set per scene evaluation via `Scene.play`).

#### Scenario: Top-level default unchanged

- **WHEN** a top-level scene instantiates an entity
- **THEN** the instance attaches to the root group (current behavior preserved)

#### Scenario: Mounted scene uses its ambient parent

- **WHEN** a scene running under a mount group instantiates an entity
- **THEN** the instance attaches to the mount group (the ambient current-parent), there being no per-callsite parent override

## REMOVED Requirements

### Requirement: Explicit parent option on instantiation

**Reason**: The parent-defining hierarchy is replaced by children-defining structure — a parent lists its children (`instantiate(Group, { children: [...] })`) rather than each child naming its parent. This keeps a single, uniform way to build the entity tree, aligned with a future JSX/component layer.

**Migration**: Replace `Scene.instantiate(Child, props, { parent: group })` by instantiating `group` with the child in its `children` list, or by instantiating the child under the intended ambient parent. Reparenting after creation is deferred (a future `appendChild`-style data update on `children`), not part of this change.
