# three-text Delta Specification

## ADDED Requirements

### Requirement: Text renders as SDF glyphs
Text entities SHALL render through signed-distance-field glyph rendering (troika-three-text or equivalent), so glyph edges stay crisp under perspective scale changes (camera dolly, depth placement) without re-rasterization per frame.

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
