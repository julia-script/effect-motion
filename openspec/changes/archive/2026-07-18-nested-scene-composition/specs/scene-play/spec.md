# scene-play Delta Specification

## ADDED Requirements

### Requirement: A played scene mounts as a bounded sub-composition
Each `Scene.play` evaluation SHALL create an implicit mount group carrying the child scene's `width`/`height` as its bounds, mounted under the ambient parent (or `options.parent`), and set as the child's ambient current-parent. Default placement SHALL center the child's bounds in the enclosing composition. The child's content SHALL be clipped to its bounds when rendered.

#### Scenario: Child smaller than the root
- **WHEN** a 1920×1080 root plays an 800×600 child with default placement
- **THEN** the child's bounds render centered in the root frame and child content outside 800×600 is not drawn

#### Scenario: Child bigger than the root
- **WHEN** a root plays a child whose bounds exceed the root's
- **THEN** the movie's resolution stays the root's, and only the part of the child inside the root frame is visible

#### Scenario: Deep nesting composes
- **WHEN** a played scene itself plays a grandchild scene
- **THEN** the grandchild's mount group nests under the child's mount group, and both clips and transforms compose

### Requirement: A played scene's background paints within its bounds
A non-transparent child `backgroundColor` SHALL be painted within the child's bounds, beneath the child's content. A transparent child background (the default) SHALL paint nothing, so nested scenes composite over the parent like After Effects precomps.

#### Scenario: Opaque nested background
- **WHEN** a played child scene has a non-transparent backgroundColor
- **THEN** a backing of that color fills exactly the child's bounds beneath its content

#### Scenario: Transparent nested background
- **WHEN** a played child scene keeps the default transparent backgroundColor
- **THEN** the parent's content shows through everywhere the child draws nothing

### Requirement: The play handle exposes the mount group
The branch handle returned by `Scene.play` SHALL expose the mount group, so the parent can transform the whole child scene with the existing group primitives (position and opacity via trait lenses, scale via group transforms). Multiple concurrent `play`s SHALL yield independent groups.

#### Scenario: Parent animates a nested scene as one unit
- **WHEN** the parent applies `moveTo`/`fadeTo`/a scale transform to a play handle's group
- **THEN** every instance of the child scene moves, fades, or scales together, bounds included

#### Scenario: Parallel scenes are independent units
- **WHEN** a root plays the same scene twice side by side
- **THEN** each play's group transforms independently of the other
