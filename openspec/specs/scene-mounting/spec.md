# scene-mounting Specification

## Purpose
TBD - created by archiving change effectable-scenes. Update Purpose after archive.
## Requirements
### Requirement: Instantiation default parent comes from context
`Scene.instantiate` SHALL resolve its default parent from an ambient current-parent service that defaults to the runner's root group. An explicit `options.parent` SHALL take precedence over the ambient parent.

#### Scenario: Top-level default unchanged
- **WHEN** a top-level scene instantiates an entity with no parent option
- **THEN** the instance attaches to the root group (current behavior preserved)

#### Scenario: Explicit parent wins
- **WHEN** a scene running under a mount group instantiates with `{ parent: otherGroup }`
- **THEN** the instance attaches to `otherGroup`, not the mount group

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

