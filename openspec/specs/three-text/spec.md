# three-text Specification

## Purpose
SDF glyph text in the three renderer: crisp edges at any perspective scale, real font-metric anchor/baseline semantics, and fidelity to the declared `Font` resource (or the library's embedded default) with no silent platform-font substitution.

## Requirements

### Requirement: Text renders as SDF glyphs
Text entities SHALL render through signed-distance-field glyph rendering, so glyph edges stay crisp under perspective scale changes (camera dolly, depth placement) without re-rasterization per frame.

#### Scenario: Text stays crisp through a dolly
- **WHEN** the camera dollies toward a text instance across many frames
- **THEN** glyph edges remain sharp at every scale, with no per-frame texture re-rasterization

### Requirement: Font resources render with fidelity
Text SHALL render with the actual typeface its `fontFamily` resolves to: the engine's embedded default font when unset, and the declared `Font` resource's bytes when set. The platform fallback font SHALL NOT silently substitute for a declared font. The existing loud-defect contract for undeclared fonts (see `font-loading`) SHALL apply unchanged.

#### Scenario: Declared font shapes the glyphs
- **WHEN** a text instance uses a declared custom `Font` resource
- **THEN** the rendered glyphs come from that font's bytes, not a platform fallback

#### Scenario: Default font without declaration
- **WHEN** a text instance sets no `fontFamily`
- **THEN** it renders with the library's embedded default font, identically in browser and Node

### Requirement: Anchor and baseline semantics preserved
Text SHALL position with baseline-left at its (x, y) anchor by default, honoring `textAnchor` (start/middle/end) and `baseline` (alphabetic/middle/hanging) offsets computed from real font metrics, and SHALL billboard and scale with perspective like other billboard shapes.

#### Scenario: Anchored text aligns by metrics
- **WHEN** two text instances share an x with `textAnchor: "middle"` and different strings
- **THEN** both render horizontally centered on that x using their measured widths

### Requirement: Overlapping ink blends exactly once
Semi-transparent text SHALL blend overlapping glyph ink — connected scripts, tight kerning, script joins — exactly once per pixel: every pixel covered by fully-covered ink from one or more glyphs reaches the same opacity, with no darker seam where glyphs overlap. Antialiasing edges retain their partial-coverage blending.

#### Scenario: Connected script at partial opacity
- **WHEN** a text instance with opacity strictly between 0 and 1 renders glyphs whose ink overlaps
- **THEN** the overlap region renders at the same opacity as non-overlapping ink, with no visible seam

### Requirement: Text ink participates in depth occlusion
In depth contexts, Text ink SHALL occlude world content behind it through the depth buffer, consistent with depth-render-order. In paint contexts, Text SHALL follow the current children paint order and SHALL appear above earlier coplanar backdrops. Non-ink regions of a text's quads SHALL NOT occlude anything in either context. Text inside an explicit paint group SHALL participate in external occlusion through the group's composite surface.

#### Scenario: Text in front of a shape
- **WHEN** a text instance in a depth context renders nearer to the camera than an overlapping shape
- **THEN** the shape is hidden behind the text's ink and visible through the text's non-ink regions

#### Scenario: Text on a coplanar backdrop
- **WHEN** a text instance and a filled shape render at the same depth in a paint context with the text later in scene order
- **THEN** the text's ink renders fully visible above the shape on every frame

#### Scenario: Text moves with its paint surface
- **WHEN** text inside a paint group is embedded in a depth scene
- **THEN** its internal position in paint order remains fixed while external depth occludes the group surface as a unit

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
