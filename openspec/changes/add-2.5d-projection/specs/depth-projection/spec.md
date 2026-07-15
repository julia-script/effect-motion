## ADDED Requirements

### Requirement: Entities live at a world position with a z axis

Every positioned entity SHALL carry a world `{x, y, z}` position, with `z` defaulting to `0`. The engine SHALL treat `z` as an ordinary numeric field so the existing animators drive it: the `~position` semantic helpers animate x/y/z together, and raw `tween` animates `z` by name. A scene that never sets `z` SHALL render identically to the same scene before a z axis existed (everything on the `z: 0` plane).

#### Scenario: Default z is zero and renders unchanged

- **WHEN** an entity is instantiated without a `z`
- **THEN** its `z` is `0` and it renders exactly where it did on the flat plane

#### Scenario: z is animated by the existing primitives

- **WHEN** the author applies `moveTo({ z: 200 })` (or `tween("z", …)`) over a duration
- **THEN** `z` lands frame-exactly on `200` on the final frame, with no z-specific animator

#### Scenario: A partial move leaves z untouched

- **WHEN** the author applies `moveTo({ x: 400 })` to an entity at `z: 150`
- **THEN** the entity's `z` remains `150`

### Requirement: A per-frame projection pass maps world anchors to the screen

The engine SHALL provide a pure projection pass that, given a frame's visible instances and the active camera, computes for each drawable leaf a screen-space anchor, a billboard scale, and a camera-space depth. The pass SHALL accumulate each leaf's world anchor by summing its ancestors' positions down the tree, and SHALL accumulate opacity as the product along that path. The pass SHALL NOT mutate any instance's data — instance data SHALL remain in world coordinates regardless of camera state.

#### Scenario: World anchor accumulates through ancestors

- **WHEN** a leaf at local `{x: 10, y: 0, z: 0}` sits inside a group at `{x: 0, y: 0, z: 100}`
- **THEN** the leaf's projected depth reflects a world z of `100` (the group offsets its subtree)

#### Scenario: Projection does not mutate world data

- **WHEN** the camera moves and a frame is projected
- **THEN** every instance's `data.x/y/z` is unchanged from its world value

#### Scenario: The reference plane renders at authored size

- **WHEN** a leaf sits on the camera's look-at (target) plane under perspective projection
- **THEN** its billboard scale is `1` (authored size), and nearer leaves scale `> 1` while farther leaves scale `< 1`

#### Scenario: Points at or behind the camera are culled

- **WHEN** a leaf's world anchor is at or behind the camera's eye plane
- **THEN** the projection marks it not-visible and no sink draws it

### Requirement: Paint order is decided by camera-space depth, not tree order

The engine SHALL order the drawable leaves back-to-front by camera-space depth (farthest first) into a single draw list, and sinks SHALL paint in that order. Tree/child order SHALL NOT determine front/back between leaves in different subtrees. Order SHALL be deterministic: equal depths SHALL be broken by the leaf's tree index (pre-order), independent of the host `Array.prototype.sort` stability, so frames are byte-reproducible across runs and platforms.

#### Scenario: Cross-subtree occlusion follows depth

- **WHEN** a child of group A is farther from the camera than a child of group B, but A is later in the tree than B
- **THEN** the child of A is painted first (behind), regardless of tree order

#### Scenario: Moving the camera re-sorts paint order

- **WHEN** the camera moves to the opposite side of a set of depth-staggered leaves, with the tree unchanged
- **THEN** the back-to-front paint order reverses

#### Scenario: Coplanar leaves fall back to tree order, deterministically

- **WHEN** two leaves share the same camera-space depth
- **THEN** they paint in tree (authoring) order, and the same scene produces the identical order on every run

### Requirement: 2D primitives stay flat; the sink applies a per-leaf screen transform

The projection SHALL keep primitives 2D: it emits, per leaf, a screen translate and a uniform billboard scale that the sink wraps around the shape's existing 2D output. The per-entity render functions SHALL be unchanged by projection. Entities SHALL be billboards (screen-facing); per-entity 3D orientation / perspective-warped quads are out of scope.

#### Scenario: Shape renderers are unchanged

- **WHEN** a circle is projected to a nearer depth
- **THEN** the sink emits the same `<circle>` output wrapped in a `translate`/`scale`, and the circle render function itself is unmodified

#### Scenario: Both sinks agree on the projected draw list

- **WHEN** the same frame is rendered by the self-contained SVG sink and the live-DOM SVG sink
- **THEN** both emit the leaves in the same depth order with the same per-leaf transform
