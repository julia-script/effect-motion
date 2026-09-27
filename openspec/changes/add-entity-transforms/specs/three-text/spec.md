## MODIFIED Requirements

### Requirement: Text ink participates in depth occlusion
Text ink SHALL occlude world content behind it through the depth buffer, consistent with the renderer's z-buffer occlusion model. At equal depth, text SHALL follow the renderer's tree paint order like any other layer (see depth-render-order) — there is no text-specific z-lift. Non-ink regions of a text's quads SHALL NOT occlude anything.

#### Scenario: Text in front of a shape
- **WHEN** a text instance renders nearer to the camera than an overlapping shape
- **THEN** the shape is hidden behind the text's ink and visible through the text's non-ink regions

#### Scenario: Text on a coplanar backdrop
- **WHEN** a text instance and a filled shape render at the same depth with the text later in the tree
- **THEN** the text's glyphs render solid above the shape on every frame, at any camera distance

#### Scenario: A later coplanar shape covers text
- **WHEN** an opaque shape at the text's depth comes later in the tree
- **THEN** the shape covers the text
