# three-text Delta

## ADDED Requirements

### Requirement: Spans render as per-range colored glyphs
A Text with `spans` SHALL render as a single glyph mesh in which each span's characters paint in the span's `fillColor` and uncovered characters paint in the entity `fillColor`. Spanned text SHALL share the entity's font, size, anchoring, baseline, opacity, depth-occlusion, and once-per-pixel blending behavior — a span changes glyph color and nothing else. Entity `opacity` SHALL apply uniformly across all spans. Changing only span colors between frames SHALL NOT re-shape the string.

#### Scenario: Highlighted code renders in one mesh
- **WHEN** a frame contains a Text whose spans color keyword and string tokens differently
- **THEN** the rendered output shows each range in its span color, positioned identically to the same string rendered without spans

#### Scenario: Span colors animate without re-layout
- **WHEN** consecutive frames differ only in a span's `fillColor` (e.g. an animated dim)
- **THEN** the rendered colors follow frame-exactly and glyph positions are unchanged

#### Scenario: Ligatures do not form across span boundaries
- **WHEN** a font with ligatures renders adjacent characters that a ligature would join, split by a span boundary
- **THEN** the characters render as separate glyphs; the same characters inside a single span still form the ligature
