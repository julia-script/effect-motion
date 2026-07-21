## MODIFIED Requirements

### Requirement: Renderer-agnostic shape definitions

The library SHALL define its built-in shapes (`Circle`, `Rect`, `Ellipse`, `Line`, `Path`, `Text`, `Image`, `Group`, `Hud`) as members of the closed entity union (see `entity-model`), declared purely as schemas with no imports from any render target. Shape definitions SHALL remain free of renderer dependencies so scenes can be authored, run, and tested with no renderer present.

Shapes SHALL NOT be defined via a generic entity constructor, and consumers SHALL NOT be able to add members to the union.

`Square` SHALL be removed: a square is a `Rect` with equal `width` and `height`. Its schema-level width-equals-height guarantee does not justify a permanent union member, a dedicated renderer, and a branch in every exhaustive match.

#### Scenario: Square is gone

- **WHEN** `Shapes.Square` is referenced
- **THEN** it does not exist; the equivalent is a `Rect` with equal `width` and `height`

#### Scenario: Definitions are target-independent

- **WHEN** the shapes module is imported
- **THEN** no renderer code is loaded, and the entities can be instantiated in scenes without any renderer present

#### Scenario: Shapes are union members

- **WHEN** a shape definition is inspected
- **THEN** it is a tagged struct belonging to the entity union, not a construction of a generic entity type

### Requirement: Portable styling props

Every built-in shape SHALL carry the uniform transform and appearance fields defined by `entity-transform` — `position`, `rotation`, `scale`, `opacity`, and `visible` — from shared mixins rather than per-shape declarations. Fillable shapes SHALL additionally carry `fillColor`; strokable shapes `strokeColor` and `strokeWidth`.

Every such field SHALL be ordinary schema data, animatable like any other field.

#### Scenario: Common props on all shapes

- **WHEN** any built-in shape is instantiated
- **THEN** its data carries the uniform transform, opacity, and visibility, and scene updates can animate them like any other field

#### Scenario: Every shape can fade

- **WHEN** any built-in shape is faded
- **THEN** its `opacity` animates — no shape lacks the field

#### Scenario: Shared fields come from mixins

- **WHEN** two shapes are compared
- **THEN** their shared fields have identical names, shapes, and defaults, because both take them from the same mixin

### Requirement: Group container entity

The library SHALL ship a `Group` container entity carrying the uniform transform and appearance fields (see `entity-transform`) plus `children` — an ordered array of instance ids held as ordinary schema data. A group's `opacity` SHALL apply to its subtree.

A `Group` SHALL NOT carry composition bounds. The `width`, `height`, and `backgroundColor` fields are removed: they duplicated values a `Scene` already owns, written only by `Scene.play` when mounting a nested scene. Composition bounds SHALL reach the renderer from the scene that declares them, and a subtree's status as a mounted composition SHALL be signalled explicitly rather than inferred from a group happening to carry a size. A `Group` SHALL position its children by composing its transform down the subtree, using the same transform representation every other entity carries; it SHALL NOT carry an affine matrix field or accept a transform-operation list.

Groups structure and position their children and paint nothing themselves. Structure SHALL be defined by children: a group's `children` input MAY be given as a polymorphic list (see the instance-children capability) that instantiation normalizes into stored ids, and instantiation SHALL NOT accept a `parent` argument on the child. Every new instance SHALL attach to its ambient parent group, defaulting to the root group (conventional id `"root"`). Destroying an instance SHALL remove its id from any group that references it. Because `children` is plain data, scene updates on a group MAY reparent and reorder children; paint order SHALL follow the children array order.

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

- **WHEN** a scene update reverses a group's children array
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

### Requirement: Uniform instance visibility

Every shape instance SHALL carry the `visible` field defined by the instance-visibility capability, as ordinary entity data defaulting to visible. Renderers MAY omit an instance whose `visible` is `false` from their output.

#### Scenario: Hidden shape may be skipped

- **WHEN** a shape instance has `visible: false`
- **THEN** a renderer is permitted to render nothing for it while other instances render normally

### Requirement: Line endpoint depth

The `Line` entity SHALL define its geometry as `start` and `end`, each a `Vec3` offset from the line's own `position` (see `entity-transform`). Both offsets SHALL be animatable as ordinary data, and both SHALL carry depth. The absolute-endpoint field vocabulary `x2`/`y2`/`z2` is removed.

`Line` SHALL be positioned by its endpoints rather than by an anchor plus orientation; its `rotation` field, carried uniformly, does not reorient a segment defined by two points.

#### Scenario: Endpoints tween independently in depth

- **WHEN** a scene animates the `end` offset's `z` toward -800
- **THEN** the end point recedes in depth each frame while the start point stays fixed
- **AND** the end point's world path is a straight line in 3D

#### Scenario: Default endpoints preserve flat lines

- **WHEN** a `Line` is instantiated with only planar endpoint offsets
- **THEN** every depth channel is 0 and the line renders exactly as a plain-2D line under the resting camera

#### Scenario: Moving the line moves both endpoints

- **WHEN** a Line's `position` is animated
- **THEN** both endpoints translate together, because both are offsets from it

### Requirement: Path command geometry

The `Path` entity SHALL carry `position` (see `entity-transform`) and define its geometry as `commands`: a non-empty array of tagged command structs — `M` (move to) and `L` (line to), each carrying a point with optional depth treated as 0 when absent, and `Z` (close subpath). Command coordinates SHALL be offsets from the path's `position`: animating `position` SHALL move the path rigidly and SHALL NOT rewrite the command array. The first command MUST be `M`; violating input SHALL fail loudly at instantiation. Curve and arc commands are not part of this vocabulary (deferred to a later iteration).

#### Scenario: First command must be a move

- **WHEN** a `Path` is instantiated whose first command is `L` or `Z`
- **THEN** instantiation fails loudly naming the invalid input

#### Scenario: Anchor moves, commands untouched

- **WHEN** a `Path`'s `position` is animated
- **THEN** the whole path translates rigidly on screen while its stored `commands` array is unchanged

#### Scenario: Flat path preserves plain-2D output

- **WHEN** a `Path` whose commands carry no depth renders under the resting camera
- **THEN** its output is identical to plain-2D rendering of the same polyline (identity invariant)

#### Scenario: Per-point depth

- **WHEN** a `Path` command point sets a nonzero depth
- **THEN** that point projects with its own perspective position and scale while other points are unaffected

## REMOVED Requirements

### Requirement: Rect corner radii

**Reason**: Removed deliberately with the entity-model rewrite. The optional `rx`/`ry` radii applied only to the billboard render path (a tilted Rect painted a projected polygon and ignored them), and their names collided with `Ellipse`'s radius fields, where `rx` meant something entirely different. Dropping them removes that collision and one more per-entity special case from the union.

**Migration**: None. Rects render with sharp corners; a scene that set `rx`/`ry` drops the props.

### Requirement: Per-target implementation manifest

**Reason**: This requirement encodes the abandoned multi-renderer premise — per-target manifest modules, each registering its own shape implementations, with SVG as the reference target. The library settled on three.js as its single renderer, which is the reason the entity world can close at all (see `entity-model`). Renderer registration is now exhaustive over the entity tag union: a missing implementation is a compile error, not a per-target registration concern.

**Migration**: None. Consumers already provide the single renderer; the bundled-layer ergonomics this requirement asked for are preserved by that renderer's own entry point.
