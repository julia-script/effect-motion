# text-entity Specification

## Purpose
TBD - created by archiving change add-text-entity. Update Purpose after archive.
## Requirements
### Requirement: Text accepts plain or rich inline content
`Shapes.Text` SHALL require `text` content with no default. The `text` value SHALL be a plain string. `Text` SHALL be a leaf: it holds text, not a subtree of formatting nodes. Existing shape props, `fontSize`, `fontFamily`, `textAnchor`, `baseline`, `~position`, and `~opacity` behavior SHALL remain entity-level behavior for the whole Text instance.

#### Scenario: Plain string is valid
- **WHEN** a Text is instantiated with `text: "hi"` and no other props
- **THEN** the data is accepted with the same defaults for position, fill, opacity, font size, and font family as before

#### Scenario: Non-string text is rejected
- **WHEN** a Text is instantiated with a structured (object/array) `text` value
- **THEN** schema validation fails

### Requirement: Text renders to SVG text on both sinks
The SVG target SHALL render Text as a `<text>` element carrying `x`, `y`, `font-size`, `font-family`, the optional `text-anchor`/`dominant-baseline` when set, and the shared style attributes. The string content SHALL render as the element's text, escaped by the string sink and set as `textContent` by the DOM sink. Literal `\n` content SHALL be preserved.

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

