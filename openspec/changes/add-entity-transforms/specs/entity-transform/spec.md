## MODIFIED Requirements

### Requirement: Transforms compose down the tree

A parent's transform SHALL apply to its subtree: children SHALL be positioned, rotated, and scaled in their parent's local space. `Group` and `Hud` SHALL compose their children through the same transform every other entity carries — no container-specific transform representation SHALL exist.

Each entity's local transform SHALL be translate(`position`) · rotate(`rotation`) · scale(`scale`): rotation and scale act about the entity's own `position` (its anchor — the center for centered shapes). `rotation` SHALL be Euler angles in radians applied X→Y→Z extrinsically (three's Euler order "ZYX"). `scale` SHALL be a per-axis factor, `1` being natural size.

The 2D affine matrix representation and its transform-operation input list are removed. Shear is consequently not expressible: where a non-uniformly scaled parent carries a rotated child, a planar child's scale SHALL be the per-axis product of its ancestors' and its own, while skeletal points map through the exact composed transform.

#### Scenario: Moving a Group moves its children

- **WHEN** a group's `position` animates
- **THEN** rendered children follow, their own local transforms unchanged

#### Scenario: Nested transforms compose

- **WHEN** a child sits inside a transformed group which itself sits inside a transformed group
- **THEN** the child renders under the composition of both ancestor transforms

#### Scenario: A rotated, scaled Group carries its children

- **WHEN** a Circle at local (10, 0) sits in a Group at (100, 50) with `rotation.z = π/2` and scale 3
- **THEN** the circle renders at (100, 80), three times its size, turned with the group

#### Scenario: A shape honors its own scale and rotation

- **WHEN** any paintable entity carries a non-identity `scale` or `rotation`
- **THEN** it renders scaled and rotated about its own `position`

#### Scenario: A collapsed scale draws nothing

- **WHEN** a Rect, Circle, Text, or Group's composed scale is zero on a planar axis (e.g. `{ x: 0, y: 0.004 }`)
- **THEN** nothing is drawn — no fill, and no stroke left behind

#### Scenario: Strokes scale with the shape

- **WHEN** a stroked shape or line renders under a composed scale
- **THEN** its stroke width is `strokeWidth` times the narrower of the planar axes' `|scale|`, so a near-zero shape is a correctly sized sliver of its fill, never a band of its stroke

#### Scenario: No container-specific transform

- **WHEN** a `Group`'s data is inspected
- **THEN** it carries the same `position`/`rotation`/`scale` fields as a leaf entity, and no affine matrix field

## ADDED Requirements

### Requirement: Group opacity multiplies into descendants

A container's `opacity` SHALL multiply into every descendant's rendered opacity, compounding through nested containers. Each descendant SHALL still blend individually (a Group is not flattened into one composite; `Scene.play` is the flattened precomp). A mounted scene's composite SHALL carry its group's opacity multiplied by its ancestors'.

#### Scenario: Fading a Group fades its children

- **WHEN** a Circle with opacity 0.5 sits in a Group with opacity 0.5 inside a Group with opacity 0.4
- **THEN** the circle renders at opacity 0.1

#### Scenario: A fading Group updates unchanged children

- **WHEN** only a Group's `opacity` changes between frames
- **THEN** its children re-render at the new effective opacity although their own data is unchanged

### Requirement: Scale and rotate animators

`Motion` SHALL provide `scale`/`scaleTo` and `rotate`/`rotateTo` as base/To pairs and duals, following the semantic-animator conventions of `move`/`moveTo`:

- `scaleTo`/`scale` accept a number (uniform on all three axes) or a partial `Vec3` (named axes only) and SHALL be accepted only for entities carrying `scale`.
- `rotateTo`/`rotate` accept a number (in-plane spin: the `z` channel, radians) or a partial `Vec3` of Euler channels (radians), for any entity carrying `rotation`.
- Unnamed channels SHALL hold at their current value; the final frame SHALL land exactly on the target; interpolation is per channel, so a target of 2π is a full turn.

#### Scenario: Uniform scale lands exactly

- **WHEN** `scaleTo(2.5, "1 second", "easeOutBack")` runs on a Circle
- **THEN** its final frame's `scale` is exactly (2.5, 2.5, 2.5)

#### Scenario: Pop in from zero

- **WHEN** `scale(0, 1, duration)` runs
- **THEN** the first frame starts near 0 and the final frame's scale is exactly (1, 1, 1)

#### Scenario: A number rotation spins in-plane

- **WHEN** `rotateTo(2π, duration)` runs on a Rect
- **THEN** only `rotation.z` animates, halfway is π, and the final value is exactly 2π

#### Scenario: Scaling a Camera is rejected

- **WHEN** `scaleTo` is applied to a Camera, which carries no `scale`
- **THEN** compilation fails
