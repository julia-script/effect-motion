# shapes Specification

## Purpose
TBD - created by syncing change add-shapes-library. Update Purpose after review.

## Requirements

### Requirement: Renderer-agnostic shape definitions
The library SHALL ship built-in shape entities (`Circle`, `Rect`, `Square`, `Ellipse`, `Line`, `Path`) under the `shapes/<Name>` namespace, defined purely as schemas with no imports from any render target.

#### Scenario: Definitions are target-independent
- **WHEN** the shapes module is imported
- **THEN** no SVG (or other target) code is loaded, and the entities can be instantiated in scenes without any renderer present

### Requirement: Portable styling props
Every built-in shape SHALL share the common prop set `x`, `y`, `fill`, `stroke`, `strokeWidth`, `opacity`, limited to properties expressible by any plausible render target; transforms are excluded.

#### Scenario: Common props on all shapes
- **WHEN** any built-in shape is instantiated
- **THEN** its data supports position and the styling props, and scene updates can animate them like any other field

### Requirement: Visible defaults
A default-constructed shape SHALL be visible: filled shapes default `fill` to black with stroke absent; `Line` defaults `stroke` to black with `strokeWidth` 1; `opacity` defaults to 1. Absent optional props SHALL be omitted from target output rather than emitted with placeholder values.

#### Scenario: Default circle is visible
- **WHEN** a `Circle` is instantiated with only a radius
- **THEN** its data has fill black, opacity 1, and no stroke, and the SVG output contains a fill attribute but no stroke attribute

#### Scenario: Default line is visible
- **WHEN** a `Line` is instantiated with only endpoints
- **THEN** its data has stroke black and strokeWidth 1, and the SVG output draws a visible line

### Requirement: Per-target implementation manifest
Each render target SHALL provide its shape implementations in a single manifest module (e.g. `svg/shapes.ts`) that imports the definitions, maps shape data to the target's format, and exports a bundled layer registering every supported built-in shape.

#### Scenario: SVG covers the full starter set
- **WHEN** the SVG shapes layer is provided
- **THEN** frames containing any built-in shape render through both the string and DOM sinks with correct tags (`circle`, `rect`, `ellipse`, `line`, `path`) and attributes

#### Scenario: One layer for consumers
- **WHEN** a consumer (demo, playground) provides the bundled shapes layer
- **THEN** no per-entity renderer registration is needed in consumer code

### Requirement: Group container entity
The library SHALL ship a `Group` container entity with position (`x`, `y`), `opacity`, `transform`, and `children` — an ordered array of instance ids held as ordinary schema data. A transform input SHALL be an ordered Effect Schema tagged-union list (including `transform/translate`, `transform/scale`, and `transform/matrix`) normalized at construction into one affine `{a,b,c,d,e,f}` matrix. Renderers SHALL receive the normalized matrix, never the operation list. Groups structure and position their children and paint nothing themselves. Structure SHALL be defined by children: a group's `children` input MAY be given as a polymorphic list (see the instance-children capability) that instantiation normalizes into stored ids, and instantiation SHALL NOT accept a `parent` argument on the child. Every new instance SHALL attach to its ambient parent group, defaulting to the root group (conventional id `"root"`). Destroying an instance SHALL remove its id from any group that references it. Because `children` is plain data, scene updates on a group MAY reparent and reorder children; paint order SHALL follow the children array order.

#### Scenario: Transform operations normalize before rendering
- **WHEN** a Group is instantiated with translate followed by scale operations
- **THEN** its stored data contains their affine matrix, post-multiplied in list order
- **AND** render targets consume only that matrix

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

### Requirement: Uniform instance visibility
Every shape instance SHALL support the builtin `$visible` instance property (defined by the instance-visibility capability), held beside its data and defaulting to visible. SVG sinks MAY omit an instance whose `$visible` is `false` from their output.

#### Scenario: Hidden shape may be skipped
- **WHEN** a shape instance has `$visible: false`
- **THEN** an SVG sink is permitted to render nothing for it while other instances render normally

### Requirement: Rect corner radii
`Shapes.Rect` SHALL carry optional, undefaulted numeric `rx`/`ry` corner radii. When set, the billboard-rendered rect draws with rounded corners; a lone radius applies to both axes (SVG semantics). Absent radii render sharp corners, byte-identical to a Rect without the props. A tilted Rect (nonzero orientation) renders its projected polygon with sharp corners regardless of radii — rounding is a billboard-path styling prop.

#### Scenario: Rounded corners render
- **WHEN** a Rect sets `rx`/`ry`
- **THEN** its corner pixels are background while its edge midpoints and center are filled

#### Scenario: Absent radii unchanged
- **WHEN** a Rect sets no radii
- **THEN** output is identical to before the props existed (sharp corners)

#### Scenario: Lone radius applies to both axes
- **WHEN** a Rect sets only `rx`
- **THEN** corners round on both axes with that radius

#### Scenario: Radii tween
- **WHEN** `rx`/`ry` are tweened
- **THEN** the corner rounding animates frame-by-frame like any numeric field

### Requirement: Line endpoint depth
The `Line` entity SHALL carry a `z2` field (default 0), making its endpoint fields fully symmetric: `x`/`y`/`z` define the start point and `x2`/`y2`/`z2` the end point, all absolute world coordinates and all animatable as raw numeric fields. `Line` SHALL NOT carry Euler orientation fields — a segment is parametrized by its endpoints, never by an anchor plus orientation.

#### Scenario: Endpoints tween independently in depth
- **WHEN** a scene runs `Motion.tweenTo(line, { z2: -800 }, "1 second")`
- **THEN** the end point recedes in depth each frame while the start point stays fixed
- **AND** the end point's world path is a straight line in 3D

#### Scenario: Default z2 preserves flat lines
- **WHEN** a `Line` is instantiated with only `x`, `y`, `x2`, `y2`
- **THEN** both `z` and `z2` are 0 and the line renders exactly as a plain-2D line under the resting camera

### Requirement: Path command geometry
The `Path` entity SHALL define its geometry as `commands`: a non-empty array of tagged command structs — `M` (move to) and `L` (line to), each carrying `x`, `y`, and an optional `z` treated as 0 when absent, and `Z` (close subpath) — replacing the former SVG `d` string, which is removed without a migration path. Command coordinates SHALL be local to the path's anchor (`x`/`y`/`z`): the `~position` trait moves the anchor and SHALL NOT rewrite the command array. The first command MUST be `M`; violating input SHALL fail loudly at instantiation. Curve and arc commands are not part of this vocabulary (deferred to a later iteration).

#### Scenario: The d string is gone
- **WHEN** a `Path` is instantiated with a `d` property
- **THEN** the schema rejects it — `commands` is the only geometry input

#### Scenario: First command must be a move
- **WHEN** a `Path` is instantiated whose first command is `L` or `Z`
- **THEN** instantiation fails loudly naming the invalid input

#### Scenario: Anchor moves, commands untouched
- **WHEN** a `Path` is moved via `Motion.moveTo` (the `~position` trait)
- **THEN** the whole path translates rigidly on screen while its stored `commands` array is unchanged

#### Scenario: Flat path preserves plain-2D output
- **WHEN** a `Path` whose commands carry no `z` renders under the resting camera
- **THEN** its output is identical to plain-2D rendering of the same polyline (identity invariant)

#### Scenario: Per-point depth
- **WHEN** a `Path` command point sets a nonzero `z`
- **THEN** that point projects with its own perspective position and scale while other points are unaffected
