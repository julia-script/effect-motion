## MODIFIED Requirements

### Requirement: Export maps declared fonts to the ThorVG rasterizer

`@effect-motion/export` SHALL provide a helper that reads a scene's fonts annotation and registers each entry that has a `src.path` with ThorVG's font rasterizer, so exported frames render those families. Entries without a `src.path` SHALL be skipped. Because ThorVG rasterizes on both browser and Node, the same declared font produces the same glyphs in the player and in export — the font engine no longer differs between preview and output.

#### Scenario: Path entries are registered with ThorVG

- **WHEN** the helper is applied to a scene declaring `{ family: "Inter", src: { path: "./fonts/Inter.ttf" } }`
- **THEN** ThorVG loads `./fonts/Inter.ttf`, and rendering the scene draws text in Inter through ThorVG's font engine

#### Scenario: Url-only entries are ignored by export

- **WHEN** the helper is applied to a scene whose only font entry has just a `src.url`
- **THEN** no font file is registered and rendering behaves as without the annotation

#### Scenario: Preview and export agree on a declared font

- **WHEN** a scene declares a `path` font and is both previewed in the browser player and exported in Node
- **THEN** the text renders identically, because the same ThorVG font rasterizer runs in both
