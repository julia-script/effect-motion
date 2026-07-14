## MODIFIED Requirements

### Requirement: Sink render functions receive frame metadata
The generic renderer family (`Renderer.make`) SHALL pass the frame's
`{ frameRate, width, height, backgroundColor, camera }` to the sink's render
function, so custom sinks can size, time, and apply the view transform to their
output from the frame alone. `camera` SHALL be `{ x, y, zoom }` taken from the
runner's active camera, defaulting to `{ x: 0, y: 0, zoom: 1 }`.

#### Scenario: Custom sink reads metadata
- **WHEN** a sink's render function is invoked for a frame with width 800 and height 600
- **THEN** it receives a metadata argument with those values in addition to the entities and its config

#### Scenario: Custom sink reads camera metadata
- **WHEN** a sink's render function is invoked for a frame whose camera is `{ x: 100, y: 0, zoom: 2 }`
- **THEN** the metadata argument carries `camera` with those values
- **AND** when the scene never configures a camera, the metadata carries `camera: { x: 0, y: 0, zoom: 1 }`
