# font-loading Specification

## Purpose
Scene-level font declaration and the loading contract. Scenes declare the fonts their text depends on via the `Fonts` annotation; the runtime never reads it (the engine cannot measure text, so fonts cannot affect frame data). Consumers load the declared `url` sources, whose bytes feed the renderer's SDF text path (see the `three-text` capability). `path`-only sources are ignored in this model.
## Requirements
### Requirement: Missing font loader is a loud defect at render
Rendering a frame containing text whose `fontFamily` id has no corresponding loader in context SHALL die with a defect naming the font id. There SHALL be no silent glyph fallback for undeclared fonts. (This is the runtime backstop for the accepted cooperative-typing boundary: hand-built resource values bypass the type-level accounting but not this check.)

#### Scenario: Undeclared font defects with its name
- **WHEN** a frame carries a Text with `fontFamily` id `"Comic"` and no `FontLoader` for `"Comic"` is in context
- **THEN** rendering dies with a defect whose message names `"Comic"`

#### Scenario: Declared fonts render normally
- **WHEN** every font id in the frame has a loader in context
- **THEN** rendering succeeds and each text uses its font's bytes

