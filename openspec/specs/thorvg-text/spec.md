# thorvg-text Specification

## Purpose
Rendering `Shapes.Text` through the ThorVG engine: the wrapped text/font C-API, URL-fetched font loading (default + on-demand), the persistent-canvas invariant that keeps the font table alive across frames, and the Text paint function.

## Requirements

### Requirement: Text and font C-API are wrapped
`@effect-motion/thorvg` SHALL expose Effect-returning wrappers over ThorVG's text and font C-API: creating a text paint, setting its font family, text content, size, color, and alignment, and loading/unloading a named font from TrueType bytes. String arguments (text content, font/family names) SHALL be marshalled to UTF-8 in scratch memory. Font loading SHALL pass the byte buffer and a mimetype to `_tvg_font_load_data`. A non-success result code SHALL surface as a typed failure naming the operation.

#### Scenario: A named font loads from bytes
- **WHEN** a TrueType byte buffer is loaded under a family name
- **THEN** the operation succeeds and text paints can reference that family by name

#### Scenario: Text content and style are set on a text paint
- **WHEN** a text paint is given a family, content string, size, and color
- **THEN** each call succeeds and the paint carries that content and style

#### Scenario: Font loading failure is a typed error
- **WHEN** `loadFontData` is called with bytes that are not a valid font
- **THEN** the effect fails with a typed exception naming the operation, not a thrown error

### Requirement: Fonts load into the engine from URLs
The package SHALL load fonts into the engine from a family→URL map: at engine setup (a `fonts` option) and on demand into an already-acquired engine (so a scene whose fonts weren't known at acquire — the engine is a process-global singleton shared across players and navigations — still gets them loaded before it renders). Each URL is fetched to TrueType bytes and loaded under its family name. Loading SHALL be idempotent per engine (a family+url already loaded into that module is skipped, tracked per-module so a recreated engine reloads). There SHALL be no filesystem read and no bundled font. A default entry SHALL map the default text family to a pinned TrueType CDN URL, so text renders with no configuration; consumers SHALL be able to override the default URL or add families. A failed fetch or load for one family SHALL be logged and skipped, not fail acquisition.

#### Scenario: Default font loads with no configuration
- **WHEN** the engine is acquired without a fonts option
- **THEN** the default family's TrueType URL is fetched and loaded, and text in the default family renders

#### Scenario: On-demand load reaches an already-acquired engine
- **WHEN** a scene declaring a font mounts after the engine was already acquired (with a different or empty font set)
- **THEN** the declared family is fetched and loaded into the live engine before the scene renders

#### Scenario: Consumer overrides a family URL
- **WHEN** the fonts option maps a family (including the default family) to a different TrueType URL
- **THEN** that URL is loaded for the family instead of the default

#### Scenario: A failed font fetch does not fail acquisition
- **WHEN** one family's URL cannot be fetched or loaded
- **THEN** engine acquisition still succeeds, a warning names the family, and other families load normally

### Requirement: The per-frame render preserves the engine font table
The frame renderer SHALL NOT destroy the ThorVG canvas per frame — `TvgCanvas.delete()` wipes the engine's loaded-font table, which would blank all text after the first frame. It SHALL reuse a persistent canvas across frames (cleared between frames, which preserves fonts).

#### Scenario: Text survives across many frames
- **WHEN** a scene containing Text is rendered for many consecutive frames on one engine
- **THEN** every frame renders the text (the font table is not wiped between frames)

### Requirement: The scene's declared fonts reach the engine
The render entry points (Node adapters, the export video path, and the React player) SHALL read the scene's `Fonts` annotation, map every entry carrying a `src.url` to a family→URL pair, merge those over the default, and provide them to the engine's fonts option, so declared families are loaded before rendering. Entries without a `src.url` SHALL be ignored (no filesystem in this model). A declared entry whose family matches the default family SHALL override the default URL.

#### Scenario: Declared url fonts are loaded for rendering
- **WHEN** a scene declares a font with a `src.url` and contains Text in that family
- **THEN** that family is fetched and loaded into the engine before the scene renders, and the text renders in that family

#### Scenario: Path-only declarations are ignored
- **WHEN** a scene declares a font with only `src.path` (no url)
- **THEN** it is not loaded (fetch-by-URL only) and no filesystem access occurs

### Requirement: Text renders through the ThorVG renderer
`builtinPaints` SHALL include a paint function for `Shapes.Text` so the coverage map is exhaustive over the built-in entities. The Text paint function SHALL set the paint's family from `fontFamily`, content from `text`, and color from `fill`, apply the instance opacity, and position/size the glyphs at the camera-projected anchor. Because ThorVG (this build) renders scene-child text only when positioned by a plain `translate` — `set_transform`, `scale`, and `text_align` on scene-child text produce nothing — the paint function SHALL fold the perspective scale into the font size and position via `translate`, applying `textAnchor`/`baseline` as an offset from an estimated text box. A missing/not-yet-loaded font SHALL degrade that one text (draw nothing) without aborting the frame.

#### Scenario: Text is no longer a coverage gap
- **WHEN** the built-in paint map is checked against the built-in entity union
- **THEN** `Shapes.Text` has a paint function (no missing-built-in type error)

#### Scenario: A Text instance renders its glyphs
- **WHEN** a scene with a `Shapes.Text` in a loaded family is rendered
- **THEN** the framebuffer contains painted glyph pixels near the text's projected position, in its fill color

#### Scenario: A missing font does not blank the frame
- **WHEN** a Text names a family that is not loaded in the engine
- **THEN** that text draws nothing but the rest of the frame (other shapes/text) still renders
