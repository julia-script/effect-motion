## ADDED Requirements

### Requirement: ThorVG headless rendering in Node is proven before any deletion

Before the SVG sinks or resvg are removed, the change SHALL prove that ThorVG's software backend rasterizes to a raw pixel buffer in Node with no browser present. If this proof fails, the SVG sinks and resvg SHALL be retained and the replacement re-scoped.

#### Scenario: A shape and text rasterize to bytes in Node

- **WHEN** the ThorVG software canvas is initialized in a plain Node process (no DOM, no browser) and a filled rect plus a text run are drawn
- **THEN** a pixel buffer is read back and written to a PNG file
- **AND** no browser or headless-browser dependency is involved.

### Requirement: One ThorVG sink drives browser and Node backends

A single sink SHALL walk the draw-list and issue ThorVG drawing calls, targeting a GPU canvas (WebGL/WebGPU) in the browser for live playback and a software canvas in Node for headless export. The draw-list-walking code SHALL be shared between both backends.

#### Scenario: The same scene renders on both backends

- **WHEN** a scene is rendered through the browser (GPU) backend and the Node (software) backend
- **THEN** both consume the identical draw-list through the same sink code
- **AND** produce the same shapes, in the same paint order, differing only in the rasterization surface.

### Requirement: Draw-list primitives map to ThorVG paints

The sink SHALL translate each draw-list node to a ThorVG primitive: shapes to `Shape` (rect/circle/ellipse/path), text to `Text`, groups to nested `Scene`s, with fill/stroke/opacity applied and the node's 2D affine transform or explicit points set. Nodes SHALL be added to the ThorVG scene in draw-list order so paint order matches.

#### Scenario: A billboard circle becomes a ThorVG circle

- **WHEN** a billboard circle draw-list node is translated
- **THEN** a ThorVG `Shape` with an appended circle carries the node's fill and its projected affine transform.

#### Scenario: A tilted polygon becomes a ThorVG path

- **WHEN** a tilted-Rect draw-list node (four screen corners) is translated
- **THEN** a ThorVG `Shape` path is built `moveTo`→`lineTo`×3→`close` through those corners with the node's fill.

### Requirement: Text renders consistently across browser and Node

Because ThorVG rasterizes text with its own font engine on every backend, text SHALL render identically in live preview and exported video for the same declared fonts.

#### Scenario: The same text matches between preview and export

- **WHEN** a scene with a declared font renders in the browser player and in the Node export path
- **THEN** the text's glyphs, metrics, and layout are produced by the same ThorVG font rasterizer on both.
