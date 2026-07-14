# text-entity — delta for add-text-font-fallback

## ADDED Requirements

### Requirement: Generic font families expand to named fallback lists
When a Text's `fontFamily` is exactly one generic keyword, the SVG renderer SHALL emit a `font-family` attribute that leads with named families and ends with the original generic: `sans-serif` → `Helvetica, Arial, DejaVu Sans, sans-serif`; `serif` → `Times New Roman, DejaVu Serif, serif`; `monospace` → `Courier New, DejaVu Sans Mono, monospace`. Any other `fontFamily` value SHALL be emitted unchanged. The expansion SHALL happen at render time in the shared render function, so both sinks emit the same value and the `Shapes.Text` schema default remains the generic `"sans-serif"`.

#### Scenario: Default sans-serif expands
- **WHEN** a Text with the default `fontFamily` is rendered
- **THEN** the emitted attribute is `font-family="Helvetica, Arial, DejaVu Sans, sans-serif"`

#### Scenario: Each generic keyword expands
- **WHEN** a Text has `fontFamily: "serif"` or `fontFamily: "monospace"`
- **THEN** the emitted `font-family` is the corresponding named-first list ending in that generic

#### Scenario: Named families and lists pass through
- **WHEN** a Text has `fontFamily: "Inter"` or `fontFamily: "Inter, sans-serif"`
- **THEN** the emitted `font-family` equals the provided value unchanged

#### Scenario: Unmapped generics pass through
- **WHEN** a Text has `fontFamily: "cursive"`
- **THEN** the emitted `font-family` is `cursive` unchanged
