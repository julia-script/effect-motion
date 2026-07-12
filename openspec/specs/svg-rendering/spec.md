# svg-rendering Specification

## Purpose
TBD - created by syncing change add-svg-dom-renderer. Update Purpose after review.

## Requirements

### Requirement: SvgNode contract
Entity renderers for SVG renderer families SHALL return `SvgNode` descriptions (`tag`, `props` of string/number values, optional `children` as nested nodes or text string) rather than strings or DOM elements, so any sink can materialize output from user-defined entity renderers without knowing the entity set.

#### Scenario: User-defined entity renders through both sinks
- **WHEN** a user registers an entity renderer layer returning an `SvgNode` for a custom entity
- **THEN** both the string sink and the DOM sink render instances of that entity without any sink changes

#### Scenario: Nested nodes
- **WHEN** an entity renderer returns a node with `children` (e.g. a `g` wrapping shapes)
- **THEN** sinks materialize the full subtree recursively

### Requirement: String sink
`SvgRenderer.render(frame, { width, height })` SHALL fold the frame's `SvgNode`s into a single SVG document string rooted at `<svg>` with the given viewport size and the SVG xmlns, escaping attribute values.

#### Scenario: Frame to string
- **WHEN** a frame with a circle instance at x=100 is rendered with width 500 and height 300
- **THEN** the result is one `<svg>` string containing width="500", height="300", the xmlns declaration, and the circle element with its attributes

#### Scenario: Attribute escaping
- **WHEN** a node prop value contains `"` or `&`
- **THEN** the string output escapes them so the document stays well-formed

### Requirement: DOM sink
`SvgDomRenderer.render(frame, { target, width, height })` SHALL materialize the frame into the given HTML element using DOM APIs, creating every SVG element with `createElementNS` and the SVG namespace, under an `<svg>` root sized by the config. Rendering a new frame SHALL replace the previous frame's content (clear-and-rebuild).

#### Scenario: Frame into element
- **WHEN** a frame with a circle and a rect is rendered into an empty div
- **THEN** the div contains an `svg` root with the configured width/height and one `circle` and one `rect` child, all in the SVG namespace

#### Scenario: Re-render replaces content
- **WHEN** frame N is rendered and then frame N+1 (with moved positions) is rendered into the same target
- **THEN** the target reflects only frame N+1's state, with no leftover nodes from frame N

#### Scenario: Namespace is sink-owned
- **WHEN** an entity renderer returns `{ tag: "circle", props: {...} }` with no namespace information
- **THEN** the DOM sink creates the element in the SVG namespace anyway

### Requirement: Absolute positioning
Frame data positions SHALL be applied as coordinates local to the containing group — the library performs no coordinate transformation between frame data and node props; targets compose group transforms natively (SVG via nested `<g transform>`). Top-level instances (children of the root group, which sits at the origin) are therefore in viewport coordinates, preserving flat-scene behavior.

#### Scenario: No transform applied to top-level instances
- **WHEN** a top-level entity's data has x=100, y=100 and its renderer maps them to cx/cy
- **THEN** the materialized element has cx="100" cy="100" regardless of viewport size

#### Scenario: Child coordinates stay local
- **WHEN** a shape at x=10 sits inside a group at x=100
- **THEN** the shape's element keeps cx="10"; its on-screen position comes from the group's transform

### Requirement: Hierarchical rendering
Frames SHALL carry a root reference (`{ instances, root }`) and renderers SHALL traverse the instance tree post-order from the root: children render before their container, and each render function receives its instance's rendered children (`children: ReadonlyArray<RenderEntitySuccess>`, empty for leaves). The root group itself SHALL NOT render — its children are the top-level entries handed to the sink. Groups materialize as SVG `<g>` elements carrying the group's translate and opacity, wrapping their rendered children. Traversal SHALL die with a defect naming the offending id when an id is referenced by more than one container (including cycles) or when a referenced id has no instance.

#### Scenario: Group wraps its children
- **WHEN** a group at x=100, y=50 contains a circle at x=10
- **THEN** the output contains a `g` element with translate(100 50) wrapping a circle with cx="10", through both the string and DOM sinks

#### Scenario: Nested groups compose transforms in the target
- **WHEN** a group containing another group containing a shape is rendered
- **THEN** the output nests `g` elements and no absolute coordinates are computed by the library

#### Scenario: Duplicate reference is a defect
- **WHEN** the same instance id appears in two groups' children
- **THEN** rendering dies with a defect naming that id

#### Scenario: Dangling reference is a defect
- **WHEN** a group's children contains an id with no instance
- **THEN** rendering dies with a defect naming that id

### Requirement: Live playback playground
The repository SHALL include a browser playground that runs a scene with a requestAnimationFrame loop pulling one `Scene.step` per display frame and rendering the result via the DOM sink, stopping when the scene completes.

#### Scenario: Watch a scene
- **WHEN** the playground dev server is started and the page opened
- **THEN** the demo scene plays as moving SVG shapes, advancing one scene phase per display frame, and stops at the scene's final state
