# node-mutation Specification

## Purpose
TBD - created by syncing change refactor-text-and-children. Update Purpose after review.

## Requirements

### Requirement: Instances track their current parent

Every instance SHALL be born mounted under the ambient parent (the runner root, or a `Scene.play` mount). The runner SHALL track each instance's current parent id, so that reparenting can detach the instance from its current parent in constant time rather than by scanning the tree.

#### Scenario: Top-level instance is born under root

- **WHEN** an instance is created at the top level
- **THEN** its id appears in the root group's children

### Requirement: appendChild reparents a node

`Scene.appendChild(parent, child)` SHALL move `child` under `parent`, first detaching it from its current parent so that it is never referenced by two parents at once. It is the explicit way to place a lazily-created instance into an existing group.

#### Scenario: Lazily-created node moved into a group

- **WHEN** a group and a separate instance are created, then `Scene.appendChild(group, instance)` is called
- **THEN** the instance's id is removed from the root's children and appended to the group's children, and it renders inside the group

#### Scenario: A children list adopts its members

- **WHEN** a group is instantiated with a `children` list containing an already-created instance
- **THEN** that instance is reparented out of the ambient parent and into the group (it appears only under the group, never duplicated)

### Requirement: removeChild detaches a node

`Scene.removeChild(parent, child)` SHALL detach `child` from `parent`, leaving it unmounted (still alive). It SHALL be a no-op when `child` is not currently a child of `parent`.

#### Scenario: Detach removes from the parent's children

- **WHEN** `Scene.removeChild(group, child)` is called for a `child` currently under `group`
- **THEN** the child's id is removed from the group's children in subsequent frames

#### Scenario: Detaching a non-child is a no-op

- **WHEN** `Scene.removeChild(group, child)` is called for a `child` that is not under `group`
- **THEN** nothing changes
