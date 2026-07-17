# shapes (delta)

## ADDED Requirements

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
