# image-assets (delta)

## ADDED Requirements

### Requirement: Scenes declare images via the Images annotation
`effect-motion` SHALL provide an `Images` module with an `ImageResource` type — `name` (string, required) and `src` (object with optional `url` and `path` strings) — and an annotation key for `ReadonlyArray<ImageResource>` usable with the existing `scene.annotate` mechanism, plus accessors reading a scene's declared images (empty when absent) and a `name -> url` map of url-carrying entries. The runtime SHALL NOT read the annotation: frame production for an annotated scene is identical to the same scene without it.

#### Scenario: Declaring images on a scene
- **WHEN** a scene is annotated with `[{ name: "logo", src: { url: "/img/logo.png" } }]`
- **THEN** the accessor returns that array and the url map contains `logo -> /img/logo.png`

#### Scenario: Undeclared scenes read as empty
- **WHEN** the accessors are applied to a scene never annotated with images
- **THEN** they return an empty array / empty map

#### Scenario: Annotation does not affect frames
- **WHEN** the same scene runs with and without an images annotation
- **THEN** both runs produce identical frame data

### Requirement: Image entity
`effect-motion` SHALL provide a `Shapes.Image` entity whose data carries a required `image` field (the declared asset name), position fields with the standard position trait lens, `opacity` with the standard opacity trait lens, and optional undefaulted numeric `width`/`height`. When both dimensions are set the picture is drawn at that size (the fields tween like any numerics); when absent the picture draws at its decoded natural size. A single set dimension SHALL be ignored (natural size used). The entity SHALL NOT carry orientation fields (billboard only).

#### Scenario: Placed and tweenable like other shapes
- **WHEN** an Image instance is instantiated and moved/faded via the standard animators
- **THEN** its frame data reflects the tweened position/opacity like any other shape

#### Scenario: Declared size drives drawing size
- **WHEN** an Image has `width: 200, height: 100`
- **THEN** the rendered picture occupies 200×100 logical units regardless of the source's natural size

#### Scenario: Natural size when undeclared
- **WHEN** an Image sets neither `width` nor `height`
- **THEN** the picture renders at its decoded natural size, and frame data is unaffected by what that size turns out to be

### Requirement: Session-loaded, session-owned pictures
The render session SHALL accept a `name -> url` image map: on open, each entry is fetched and decoded once into a picture held by the session, and on close the session's pictures are released. A failed fetch or decode for one entry SHALL be a logged skip naming the asset and source — the session opens and other entries load. Per frame, rendering SHALL reuse the session's decoded picture (no per-frame decode); the per-frame paint object joins the frame subtree and is freed with it.

#### Scenario: Decode happens once per session
- **WHEN** a session with one declared image renders many frames containing it
- **THEN** the image bytes are fetched and decoded once, at session open

#### Scenario: One bad URL among several images
- **WHEN** a session declares three images and one URL returns 404
- **THEN** the other two load, the failure is logged, and the session opens

#### Scenario: Session close releases pictures
- **WHEN** a session closes
- **THEN** its decoded pictures are freed (pictures are session-owned paints, not engine-global)

### Requirement: Missing images soft-skip at paint time
An Image entity whose `image` name is not present in the session's picture map SHALL paint nothing for that frame without failing the frame; every other paintable renders normally. Rendered output MAY depend on which images loaded; frame data SHALL NOT.

#### Scenario: Unloaded asset paints nothing
- **WHEN** a frame contains an Image whose asset failed to load (or was never declared)
- **THEN** that instance draws nothing and the rest of the frame renders

### Requirement: Player loads declared images before ready
The player SHALL pass the scene's declared image url map to its render session so images load concurrently with initial frame buffering, and readiness SHALL gate on image settlement the same way it gates on fonts. Entries without a `src.url` SHALL be skipped. When the player unmounts, its session's pictures are released with the session.

#### Scenario: First frame waits for images
- **WHEN** a scene declaring an image mounts in the player
- **THEN** the player reports ready only after the image load has settled and the first frame is buffered

#### Scenario: Failing image does not fail playback
- **WHEN** a declared image URL fails to load
- **THEN** the player still becomes ready and that Image entity simply paints nothing
