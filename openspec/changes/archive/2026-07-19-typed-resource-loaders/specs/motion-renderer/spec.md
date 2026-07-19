# motion-renderer Specification (delta)

## ADDED Requirements

### Requirement: Render requires and resolves frame resources
`Renderer.render` SHALL accept a `Frame<Resources>` and require `Resources` in its effect requirements. For each resource id encountered in frame data, the renderer SHALL resolve the loader from context by rebuilding the string-derived tag (per `resource-loaders`); a missing loader SHALL be a loud defect naming the resource id. Registration into the engine/session (font upload, picture decode) SHALL happen lazily on first use of a resource within a render session, from the loader's already-loaded bytes, and be cached for the session — never re-registered per frame, and never fetched at render time. The default font's loader SHALL be auto-provided beneath caller-supplied context, overridable by the reserved `"sans-serif"` id.

#### Scenario: Loader resolved from frame data id
- **WHEN** a frame contains text with `fontFamily` id `"Roboto"` and a `FontLoader<"Roboto">` service is in context
- **THEN** the renderer resolves the loader via the tag rebuilt from the string `"Roboto"` and registers its bytes with the engine

#### Scenario: Registration happens once per session
- **WHEN** many frames referencing the same font render in one session
- **THEN** the font's bytes are registered with the engine once, on the first frame that uses it

#### Scenario: Missing loader is a defect naming the id
- **WHEN** a frame references a resource id with no loader in context
- **THEN** rendering dies with a defect whose message names that id

#### Scenario: Default font provided automatically
- **WHEN** a frame contains text using the default font and the caller supplied no loaders
- **THEN** rendering succeeds using the auto-provided default font bytes
