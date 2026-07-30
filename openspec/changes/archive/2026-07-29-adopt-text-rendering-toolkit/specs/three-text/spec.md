## ADDED Requirements

### Requirement: Overlapping ink blends exactly once
Semi-transparent text SHALL blend overlapping glyph ink — connected scripts, tight kerning, script joins — exactly once per pixel: every pixel covered by fully-covered ink from one or more glyphs reaches the same opacity, with no darker seam where glyphs overlap. Antialiasing edges retain their partial-coverage blending.

#### Scenario: Connected script at partial opacity
- **WHEN** a text instance with opacity strictly between 0 and 1 renders glyphs whose ink overlaps
- **THEN** the overlap region renders at the same opacity as non-overlapping ink, with no visible seam

### Requirement: Text ink participates in depth occlusion
Text ink SHALL occlude world content behind it through the depth buffer, consistent with the renderer's z-buffer occlusion model, and SHALL sit above coplanar backdrops deterministically. Non-ink regions of a text's quads SHALL NOT occlude anything.

#### Scenario: Text in front of a shape
- **WHEN** a text instance renders nearer to the camera than an overlapping shape
- **THEN** the shape is hidden behind the text's ink and visible through the text's non-ink regions

#### Scenario: Text on a coplanar backdrop
- **WHEN** a text instance and a filled shape render at the same depth with the text in front by scene order
- **THEN** the text's ink renders fully visible above the shape on every frame
