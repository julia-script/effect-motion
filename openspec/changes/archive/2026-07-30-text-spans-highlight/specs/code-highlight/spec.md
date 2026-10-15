# code-highlight Delta

## Purpose

Author-side syntax highlighting for code shown in scenes: tokenize a code string with a caller-supplied Lezer parser, map token tags to colors through a plain-object theme, and emit Text span data — plus selection/dim derivation over those spans, static and animated. Frames stay pure data; the renderer never learns what a language is.

## ADDED Requirements

### Requirement: Highlighting produces Text span data
`highlight(code, parser, theme)` SHALL parse the code with the caller-supplied Lezer parser and return `{ text, spans }` spreadable into a Text: one span per maximal run of same-colored tokens, colored through the theme. Tokens whose highlight tag has no theme entry SHALL produce no span (they fall back to the entity `fillColor`). The result SHALL be deterministic — same code, parser, and theme in, same spans out — and SHALL be computed at authoring time with no renderer involvement. Language parsers SHALL be the caller's own dependency; the package SHALL NOT bundle language grammars.

#### Scenario: TypeScript snippet is tokenized
- **WHEN** `highlight` runs over `const x = "hi"` with a TypeScript Lezer parser and a theme coloring keywords and strings
- **THEN** the result carries spans coloring `const` with the keyword color and `"hi"` with the string color, and no span over `x` if variables are unthemed

#### Scenario: Determinism across runs
- **WHEN** the same code, parser, and theme are highlighted twice
- **THEN** both results are deeply equal

### Requirement: Themes are plain data
A theme SHALL be a plain serializable object mapping highlight-tag names to Colors. Constructing or consuming a theme SHALL NOT require any CodeMirror or Lezer style machinery beyond tag names.

#### Scenario: Theme literal works directly
- **WHEN** a theme is written as an object literal such as `{ keyword: <blue>, string: <green>, comment: <gray> }`
- **THEN** `highlight` accepts it without wrapping or registration

### Requirement: Selection dims the unselected remainder
A selection helper SHALL derive a new span set from a highlighted result and one or more character ranges: characters inside the ranges keep their colors, and every character outside them — including characters not covered by any input span — paints its color mixed toward a caller-stated background color by a dim amount. The derivation SHALL be pure span data in, pure span data out.

#### Scenario: One range selected
- **WHEN** a selection over one identifier is applied with a background color and default dim amount
- **THEN** the identifier's spans keep their colors and all other characters (spanned or plain) carry colors mixed toward the background

### Requirement: Selection changes animate frame-exactly
An animated selection SHALL interpolate between span sets over a duration: span colors mix per frame, the final frame lands exactly on the target span set, and the animation SHALL compose with the standard combinators like any animator. Determinism invariants apply — no wall-clock, same inputs produce the same frames.

#### Scenario: Selection sweep
- **WHEN** a scene animates the selection from one range to another over 30 frames
- **THEN** intermediate frames carry mixed span colors, frame 30 equals the target selection's span set exactly, and re-running the scene reproduces identical frames
