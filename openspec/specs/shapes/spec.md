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
