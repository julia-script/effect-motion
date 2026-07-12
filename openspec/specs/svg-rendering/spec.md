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
Frame data positions SHALL be applied as absolute coordinates within the configured viewport; no coordinate transformation is performed between frame data and node props.

#### Scenario: No transform applied
- **WHEN** an entity's data has x=100, y=100 and its renderer maps them to cx/cy
- **THEN** the materialized element has cx="100" cy="100" regardless of viewport size

### Requirement: Live playback playground
The repository SHALL include a browser playground that runs a scene with a requestAnimationFrame loop pulling one `Scene.step` per display frame and rendering the result via the DOM sink, stopping when the scene completes.

#### Scenario: Watch a scene
- **WHEN** the playground dev server is started and the page opened
- **THEN** the demo scene plays as moving SVG shapes, advancing one scene phase per display frame, and stops at the scene's final state
