# scene-mounting Specification

## Purpose
TBD - created by archiving change effectable-scenes. Update Purpose after archive.
## Requirements
### Requirement: Instantiation default parent comes from context
`Scene.instantiate` SHALL resolve its parent from an ambient current-parent service that defaults to the runner's root group. `Scene.instantiate` SHALL NOT accept an explicit `options.parent` argument — structure is defined by an entity's `children`, not by naming a parent at the child's callsite. The ambient current-parent remains the mount mechanism (set per scene evaluation via `Scene.play`).

#### Scenario: Top-level default unchanged
- **WHEN** a top-level scene instantiates an entity
- **THEN** the instance attaches to the root group (current behavior preserved)

#### Scenario: Mounted scene uses its ambient parent
- **WHEN** a scene running under a mount group instantiates an entity
- **THEN** the instance attaches to the mount group (the ambient current-parent), there being no per-callsite parent override

### Requirement: Scenes can be mounted into a group
Running or forking a child scene SHALL accept a mount option (a group instance) that becomes the child's ambient parent for the duration of its evaluation.

#### Scenario: Child instances land in the mount group
- **WHEN** a parent creates group `g1` and runs sceneA mounted into `g1`
- **THEN** every instance sceneA creates without an explicit parent attaches under `g1`, and moving/fading `g1` affects all of them

### Requirement: One scene value, many mounts
A scene value SHALL be re-runnable: evaluating the same scene twice (e.g. mounted into two different groups) SHALL create independent instances per evaluation.

#### Scenario: Reused scene
- **WHEN** the same scene value is forked twice, mounted into `g1` and `g2`
- **THEN** two independent sets of instances exist, one under each group, animating independently

