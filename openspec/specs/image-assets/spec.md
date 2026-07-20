# image-assets Specification

## Purpose
Scene-level image assets: scenes declare images via the `Images` annotation (name plus url/path source), the `Shapes.Image` entity places them as billboard paintables, and the renderer decodes each declared image once into a renderer-owned texture disposed on scope close. The render path soft-skips images that failed to load — rendered output may vary, frame data never does. Spans `effect-motion` (annotation, entity) and `@effect-motion/renderer`'s scoped texture registry (loading, ownership, draw).
## Requirements
### Requirement: Image entity
`effect-motion` SHALL provide a `Shapes.Image` entity whose data carries a required `image` field holding an Image resource reference (`Image.schema`, `{ _tag, id }`) — not a plain name string — position fields with the standard position trait lens, `opacity` with the standard opacity trait lens, and optional undefaulted numeric `width`/`height`. When both dimensions are set the picture is drawn at that size (the fields tween like any numerics); when absent the picture draws at its decoded natural size. A single set dimension SHALL be ignored (natural size used). The entity SHALL NOT carry orientation fields (billboard only).

#### Scenario: Image references a resource value
- **WHEN** an Image is instantiated with `image: yield* Image.Image("logo")`
- **THEN** the stored data carries the resource reference with id `"logo"` and the scene's type carries `ImageLoader<"logo">`

#### Scenario: Plain string name is rejected
- **WHEN** an Image is instantiated with `image: "logo"` (a bare string)
- **THEN** schema validation fails

#### Scenario: Both dimensions set draws at that size
- **WHEN** an Image has `width: 200` and `height: 100`
- **THEN** the picture is drawn at 200×100

#### Scenario: Single dimension is ignored
- **WHEN** an Image sets only `width`
- **THEN** the picture draws at its natural decoded size

### Requirement: Session-loaded, session-owned pictures
The render path SHALL register each distinct image resource once per renderer scope: on the first frame referencing an image id, the loader's already-loaded bytes are decoded into a texture held by the renderer; subsequent frames reuse the decoded texture (no per-frame decode); on renderer scope close the textures are released. There SHALL be no URL fetching in this path — bytes come from loader services, loaded eagerly at layer construction (see `resource-loaders`).

#### Scenario: Decode happens once per renderer scope
- **WHEN** a renderer draws many frames containing the same image
- **THEN** the loader's bytes are decoded into a texture once, on first use, and reused thereafter

#### Scenario: Scope close releases textures
- **WHEN** the renderer's scope closes
- **THEN** its decoded textures are disposed (textures are renderer-owned resources, not process-global)

