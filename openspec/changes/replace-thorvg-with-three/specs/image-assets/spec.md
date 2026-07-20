# image-assets Delta Specification

## MODIFIED Requirements

### Requirement: Session-loaded, session-owned pictures
The render path SHALL register each distinct image resource once per renderer scope: on the first frame referencing an image id, the loader's already-loaded bytes are decoded into a texture held by the renderer; subsequent frames reuse the decoded texture (no per-frame decode); on renderer scope close the textures are released. There SHALL be no URL fetching in this path — bytes come from loader services, loaded eagerly at layer construction (see `resource-loaders`).

#### Scenario: Decode happens once per renderer scope
- **WHEN** a renderer draws many frames containing the same image
- **THEN** the loader's bytes are decoded into a texture once, on first use, and reused thereafter

#### Scenario: Scope close releases textures
- **WHEN** the renderer's scope closes
- **THEN** its decoded textures are disposed (textures are renderer-owned resources, not process-global)
