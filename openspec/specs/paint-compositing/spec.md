# paint-compositing Specification

## Purpose

Define predictable 2D paint order for scenes and groups, including a 2D surface embedded in a depth-rendered scene, without requiring manual z offsets.

## Requirements

### Requirement: Explicit paint contexts
A paint scene or explicit paint Group SHALL establish a paint context. Inherited groups SHALL participate in the nearest context. Context mode SHALL NOT change automatically when a child moves in z, rotates, fades or when the camera changes. Child transforms SHALL affect projected appearance, but internal depth SHALL NOT override paint order.

#### Scenario: Ordinary 2D scene
- **WHEN** a default scene creates a background, rectangle and label at z=0 in that order
- **THEN** the rectangle appears over the background and the label over the rectangle without any depth adjustment

#### Scenario: Mode survives animation
- **WHEN** a paint-context child is translated fractionally, tilted, moved in z or faded
- **THEN** it retains its place in paint order and does not switch to depth-based occlusion

### Requirement: Current tree order controls painting
A paint context SHALL use depth-first traversal of its current ordered children arrays. Later siblings and their inherited subtrees SHALL paint above earlier siblings. Each leaf's fill SHALL paint before its stroke, before moving to the next leaf. Opacity changes SHALL NOT change this ordering. An explicit nested paint group SHALL occupy one paint position in its enclosing context.

#### Scenario: Reorder retained siblings
- **WHEN** two overlapping siblings exchange positions in children without recreation
- **THEN** which sibling paints on top reverses in the next rendered frame

#### Scenario: Shape and its border remain together
- **WHEN** shape A has a fill and stroke and shape B follows A
- **THEN** A's fill paints before A's stroke and both precede B's paint operations

#### Scenario: Fade through opaque endpoint
- **WHEN** a later sibling fades from opacity 0 through fractional values to 1
- **THEN** its paint position remains unchanged throughout

### Requirement: Paint-group isolation and external placement
An explicit paint group SHALL produce one transparent surface in group-local coordinates, positioned, scaled and rotated using the group's transform in its parent. Its children SHALL be projected within that local context, not independently depth-tested against surrounding world content. The surface SHALL use the enclosing paint order or depth occlusion as appropriate. Fully transparent regions SHALL neither color nor occlude the background.

#### Scenario: Flat panel inside a 3D scene
- **WHEN** a depth scene contains a paint group with a coplanar background and label, plus an external object in front of the group
- **THEN** the label remains visible over its own background while the nearer external object occludes the group surface

#### Scenario: Transparent holes
- **WHEN** an unfilled outlined paint group is in front of another world object
- **THEN** that object remains visible through the unpainted interior and outside the group's painted content

#### Scenario: Group opacity applies once
- **WHEN** a paint group containing two overlapping opaque children has opacity 0.5
- **THEN** both the overlapping and non-overlapping fully covered regions of the group have composite opacity 0.5

### Requirement: Content bounds and retained lifetime
Paint groups SHALL derive sufficient content bounds without public composition-size fields. Bounds SHALL include projected child geometry, stroke widths and antialiasing support. Empty or hidden groups SHALL paint nothing. Resizing, child removal, nesting and disposal SHALL not leave stale pixels or unbounded live rendering resources.

#### Scenario: Bounds change without clipping
- **WHEN** a thick stroked child moves or rotates outside its previous bounds
- **THEN** its complete stroke remains visible with stable authored placement

#### Scenario: Remove and replay
- **WHEN** a nested paint group is removed and the scene is replayed
- **THEN** removed content is absent, resources from the old group are released, and replay has the same paint ordering

### Requirement: Context metadata is portable
Paint-context behavior SHALL be the same for browser playback, seeking, nested scene playback and Node export. Given equal scene and runner settings, context selection and paint ordering SHALL be deterministic. Pixel-byte identity across devices SHALL NOT be required.

#### Scenario: Fresh seek versus sequential playback
- **WHEN** the same frame is reached by fresh synchronization and by sequential playback
- **THEN** paint order, context boundaries and visible layering agree
