# text-entity Specification (delta)

## MODIFIED Requirements

### Requirement: Text accepts plain or rich inline content
`Shapes.Text` SHALL require `text` content with no default. The `text` value SHALL be a plain string. `Text` SHALL be a leaf: it holds text, not a subtree of formatting nodes. `fontFamily` SHALL hold a Font resource reference (`Font.schema`, `{ _tag, id }`) with a constructor default of the built-in `Font.default` (reserved id `"sans-serif"`); a plain string family SHALL be rejected by schema validation. Existing shape props, `fontSize`, `textAnchor`, `baseline`, `~position`, and `~opacity` behavior SHALL remain entity-level behavior for the whole Text instance.

#### Scenario: Plain string is valid
- **WHEN** a Text is instantiated with `text: "hi"` and no other props
- **THEN** the data is accepted with the same defaults for position, fill, opacity, and font size as before, and `fontFamily` defaults to the `Font.default` reference

#### Scenario: Non-string text is rejected
- **WHEN** a Text is instantiated with a structured (object/array) `text` value
- **THEN** schema validation fails

#### Scenario: String fontFamily is rejected
- **WHEN** a Text is instantiated with `fontFamily: "Inter"` (a bare string)
- **THEN** schema validation fails

#### Scenario: Declared font is stored by reference
- **WHEN** a Text is instantiated with `fontFamily: yield* Font.Font("Inter")`
- **THEN** the stored data carries the resource reference with id `"Inter"`
