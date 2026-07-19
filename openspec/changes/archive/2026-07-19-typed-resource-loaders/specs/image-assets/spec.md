# image-assets Specification (delta)

## REMOVED Requirements

### Requirement: Scenes declare images via the Images annotation
**Reason**: Replaced by typed resource loaders; the `Images` annotation module is deleted with the annotation mechanism.
**Migration**: Declare images with `Image.Image("<name>")`, yield the constant in the scene, pass the value to the entity's `image` field, and provide bytes via the image layer helper (see `resource-loaders`).

### Requirement: Missing images soft-skip at paint time
**Reason**: Load failures now happen at layer construction (surfaced as a runtime-build error, e.g. the player's error state), and an undeclared image at render is a loud defect naming the id — consistent with the font contract. The soft-skip model no longer exists.
**Migration**: Provide a loader for every image id the scene's frames reference; handle load failures where the runtime is built.

### Requirement: Player loads declared images before ready
**Reason**: The player no longer reads annotations; images load with the `renderLayers` runtime construction like fonts (see `react-player`).
**Migration**: Pass the image layers via `renderLayers`.

## MODIFIED Requirements

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
The render path SHALL register each distinct image resource once per render session: on the first frame referencing an image id, the loader's already-loaded bytes are decoded into a picture held by the session; subsequent frames reuse the decoded picture (no per-frame decode); on session close the session's pictures are released. There SHALL be no URL fetching in this path — bytes come from loader services, loaded eagerly at layer construction (see `resource-loaders`). The per-frame paint object joins the frame subtree and is freed with it.

#### Scenario: Decode happens once per session
- **WHEN** a session renders many frames containing the same image
- **THEN** the loader's bytes are decoded into a picture once, on first use, and reused thereafter

#### Scenario: Session close releases pictures
- **WHEN** a session closes
- **THEN** its decoded pictures are freed (pictures are session-owned paints, not engine-global)
