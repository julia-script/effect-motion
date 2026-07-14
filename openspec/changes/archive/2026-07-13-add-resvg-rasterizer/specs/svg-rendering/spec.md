# svg-rendering — delta for add-resvg-rasterizer

## ADDED Requirements

### Requirement: Sinks agree on the built-in shape surface
For every built-in shape, the string sink and the DOM sink SHALL produce equivalent output — the same element tags, the same attributes and values, the same tree structure, and the same text content — when rendering the same frame. Equivalence is structural (canonical element-by-element comparison), not byte equality of serialized markup.

#### Scenario: All built-in shapes render identically through both sinks
- **WHEN** a frame containing every built-in shape (circle, rect, square, ellipse, line, path with offset, nested group, plain and rich text with alignment props) is rendered by the string sink and by the DOM sink
- **THEN** parsing the string output yields a tree that matches the DOM sink's materialized elements tag-for-tag, attribute-for-attribute, including nested `tspan` structure and text content

#### Scenario: Parity covers frame metadata
- **WHEN** the same frame is rendered by both sinks with no size in config
- **THEN** both roots carry the frame's `width`/`height` metadata and the same background rect
