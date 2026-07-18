## ADDED Requirements

### Requirement: Path painted from projected subpaths
The renderer SHALL paint a `Path` paintable directly from its projected screen subpaths via ThorVG `moveTo`/`lineTo`/`close` calls — no SVG d-string parsing anywhere in the pipeline. `Path` SHALL be part of the exhaustive built-in paint manifest (the type-level coverage guarantee); the former carve-out requiring consumers to supply their own Path paint function is removed. Subpath points arrive already in screen space, so no ThorVG transform is applied to a Path paint; fill, stroke, and opacity apply as for other shapes, with stroke width scaled by the path's perspective scale.

#### Scenario: Path renders through the built-in manifest
- **WHEN** a frame contains a `Path` and no consumer-provided paint functions
- **THEN** the path renders through the built-in ThorVG paint path

#### Scenario: Closed subpath closes in ThorVG
- **WHEN** a Path subpath ends with a `Z` command
- **THEN** the emitted ThorVG geometry is closed and fills as a polygon

#### Scenario: No transform on path paints
- **WHEN** a Path paintable is painted
- **THEN** its geometry is emitted at projected screen coordinates with no transform call issued
