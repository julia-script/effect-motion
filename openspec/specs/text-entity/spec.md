# text-entity Specification

## Purpose
TBD - created by archiving change add-text-entity. Update Purpose after archive.
## Requirements
### Requirement: Text is a single-line, single-style run
`Shapes.Text` SHALL represent one line of uniformly-styled text mirroring SVG `<text>`. It SHALL require `text` content (no default) and provide the shared filled-shape props (`x`, `y`, `fill`, optional `stroke`/`strokeWidth`, `opacity`), a defaulted numeric `fontSize` (16), `fontFamily` defaulting to the generic `"sans-serif"` family, and optional `textAnchor` (`start`/`middle`/`end`) and `baseline` (`auto`/`middle`/`hanging`).

#### Scenario: Defaults are visible and deterministic
- **WHEN** a Text is instantiated with only `text` and a position
- **THEN** it renders black, opaque, 16px, in the generic sans-serif family

### Requirement: Text renders to SVG text on both sinks
The SVG target SHALL render Text as a `<text>` element carrying `x`, `y`, `font-size`, `font-family`, the optional `text-anchor`/`dominant-baseline` when set, the shared style attributes, and the content as the element's text — escaped by the string sink and set as textContent by the DOM sink.

#### Scenario: Content is escaped
- **WHEN** a Text with content `a < b & c` is rendered by the string sink
- **THEN** the markup contains `a &lt; b &amp; c` inside a `<text>` element

#### Scenario: Optional alignment props are omitted when unset
- **WHEN** a Text without `textAnchor`/`baseline` is rendered
- **THEN** no `text-anchor` or `dominant-baseline` attributes are emitted

#### Scenario: Centered text
- **WHEN** a Text has `textAnchor: "middle"` and `baseline: "middle"`
- **THEN** the rendered element carries `text-anchor="middle"` and `dominant-baseline="middle"`

### Requirement: Text animates through the standard traits and tweens
Text SHALL provide the `~position` and `~opacity` traits, and its numeric props (including `fontSize`) SHALL be tweenable.

#### Scenario: Move and fade
- **WHEN** a Text is animated with `Motion.moveTo` and `Motion.fadeTo`
- **THEN** its position and opacity interpolate per frame like any shape

#### Scenario: Font size tween
- **WHEN** a Text is animated with `Motion.tweenTo({ fontSize: 48 }, …)`
- **THEN** `fontSize` interpolates per frame and the rendered `font-size` follows

