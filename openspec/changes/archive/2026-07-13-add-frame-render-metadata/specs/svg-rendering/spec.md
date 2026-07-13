# svg-rendering Specification (delta)

## MODIFIED Requirements

### Requirement: String sink
`SvgRenderer.render(frame, config)` (config's `width`/`height` optional) SHALL fold the frame's `SvgNode`s into a single SVG document string rooted at `<svg>` with the SVG xmlns, escaping attribute values. The viewport size SHALL default to the frame's own `width`/`height` metadata; an explicit `width`/`height` in config overrides it.

#### Scenario: Frame to string
- **WHEN** a frame with a circle instance at x=100 is rendered with width 500 and height 300
- **THEN** the result is one `<svg>` string containing width="500", height="300", the xmlns declaration, and the circle element with its attributes

#### Scenario: Size from frame metadata
- **WHEN** a frame from a scene run with `{ width: 800, height: 600 }` is rendered with no size in config
- **THEN** the `<svg>` string carries width="800" and height="600"

#### Scenario: Config overrides frame metadata
- **WHEN** a frame with width 800 metadata is rendered with `{ width: 100, height: 100 }`
- **THEN** the `<svg>` string carries width="100" and height="100"

#### Scenario: Attribute escaping
- **WHEN** a node prop value contains `"` or `&`
- **THEN** the string output escapes them so the document stays well-formed

### Requirement: DOM sink
`SvgDomRenderer.render(frame, { target, width?, height? })` SHALL materialize the frame into the given HTML element using DOM APIs, creating every SVG element with `createElementNS` and the SVG namespace, under an `<svg>` root. The root size SHALL default to the frame's own `width`/`height` metadata; explicit config values override it. Rendering a new frame SHALL replace the previous frame's content (clear-and-rebuild).

#### Scenario: Frame into element
- **WHEN** a frame with a circle and a rect is rendered into an empty div
- **THEN** the div contains an `svg` root with the configured width/height and one `circle` and one `rect` child, all in the SVG namespace

#### Scenario: Size from frame metadata
- **WHEN** a frame from a scene run with `{ width: 800, height: 600 }` is rendered with only `target` in config
- **THEN** the `svg` root carries width="800" and height="600"

#### Scenario: Re-render replaces content
- **WHEN** frame N is rendered and then frame N+1 (with moved positions) is rendered into the same target
- **THEN** the target reflects only frame N+1's state, with no leftover nodes from frame N

#### Scenario: Namespace is sink-owned
- **WHEN** an entity renderer returns `{ tag: "circle", props: {...} }` with no namespace information
- **THEN** the DOM sink creates the element in the SVG namespace anyway
