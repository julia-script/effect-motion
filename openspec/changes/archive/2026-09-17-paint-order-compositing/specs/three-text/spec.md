## MODIFIED Requirements

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
