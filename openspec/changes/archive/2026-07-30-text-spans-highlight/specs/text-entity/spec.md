# text-entity Delta

## MODIFIED Requirements

### Requirement: Text accepts plain or rich inline content
`Shapes.Text` SHALL require `text` content with no default. The `text` value SHALL be a plain string. `Text` SHALL be a leaf: it holds text, not a subtree of formatting nodes. Rich inline color SHALL be expressed through an optional `spans` field: an array of `{ from, to, fillColor }` ranges over the string (UTF-16 indices, `from` inclusive, `to` exclusive) whose characters paint in the span's `fillColor` instead of the entity `fillColor`. Spans SHALL be plain serializable data — no parser, theme, or language reference lives in entity data. Span ranges SHALL be non-empty, in-bounds, in ascending order, and non-overlapping; a violating span set SHALL be rejected by schema validation. `fontFamily` SHALL hold a Font resource reference (`Font.schema`, `{ _tag, id }`) with a constructor default of the built-in `Font.default` (reserved id `"sans-serif"`); a plain string family SHALL be rejected by schema validation. Existing shape props, `fontSize`, `textAnchor`, `baseline`, position, and opacity behavior SHALL remain entity-level behavior for the whole Text instance, spans included.

#### Scenario: Plain string is valid
- **WHEN** a Text is instantiated with `text: "hi"` and no other props
- **THEN** the data is accepted with the same defaults for position, fill, opacity, and font size as before, `fontFamily` defaults to the `Font.default` reference, and no spans are stored

#### Scenario: Non-string text is rejected
- **WHEN** a Text is instantiated with a structured (object/array) `text` value
- **THEN** schema validation fails

#### Scenario: Spans color ranges of the string
- **WHEN** a Text is instantiated with `text: "const x"` and `spans: [{ from: 0, to: 5, fillColor: <blue> }]`
- **THEN** the data is accepted and stores the span with its color; characters 5–7 remain governed by the entity `fillColor`

#### Scenario: Overlapping or out-of-bounds spans are rejected
- **WHEN** a Text is instantiated with spans that overlap each other, sit out of ascending order, are empty (`from === to`), or extend past the string's length
- **THEN** schema validation fails naming the offending span

#### Scenario: String fontFamily is rejected
- **WHEN** a Text is instantiated with `fontFamily: "Inter"` (a bare string)
- **THEN** schema validation fails

#### Scenario: Declared font is stored by reference
- **WHEN** a Text is instantiated with `fontFamily: yield* Font.Font("Inter")`
- **THEN** the stored data carries the resource reference with id `"Inter"`
