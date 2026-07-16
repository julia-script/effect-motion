# font-loading Specification

## Purpose
Scene-level font declaration and the loading contract. Scenes declare the fonts their text depends on via the `Fonts` annotation; the runtime never reads it (the engine cannot measure text, so fonts cannot affect frame data). Consumers load the declared `url` sources into the ThorVG engine, which rasterizes the text (fetch-by-URL, TrueType; see the `thorvg-text` capability). `path`-only sources are ignored in this model.

## Requirements

### Requirement: Scenes declare fonts via the Fonts annotation
`@effect-motion/motion` SHALL provide a `Fonts` module with a `FontResource` type — `family` (string, required), `src` (object with optional `url` and `path` strings), optional `weight` (number) and `style` (`"normal"` | `"italic"`) — and an annotation key for `ReadonlyArray<FontResource>` usable with the existing `scene.annotate` mechanism. The module SHALL provide an accessor that reads a scene's declared fonts, returning an empty array when the annotation is absent. The runtime SHALL NOT read the annotation: frame production for an annotated scene is identical to the same scene without the annotation.

#### Scenario: Declaring fonts on a scene
- **WHEN** a scene is annotated with `[{ family: "Inter", src: { url: "/fonts/Inter.ttf" } }]`
- **THEN** the accessor returns that array from the annotated scene value

#### Scenario: Undeclared scenes read as empty
- **WHEN** the accessor is applied to a scene that was never annotated with fonts
- **THEN** it returns an empty array

#### Scenario: Annotation does not affect frames
- **WHEN** the same scene is run with and without a fonts annotation
- **THEN** both runs produce identical frame data

### Requirement: Player loads declared fonts before ready
`usePlayer` SHALL read the scene's fonts annotation and, for every entry carrying a `src.url`, provide that family→URL to the shared ThorVG runtime so the engine loads the font (fetched by URL, TrueType), concurrently with initial frame buffering. `status` SHALL remain `'loading'` until both the first frame is buffered and every attempted font load has settled. An individual font load failure SHALL NOT fail playback or block readiness. Entries without a `src.url` SHALL be skipped (no filesystem). Rendered output SHALL be unchanged by whether a given font loaded — only which glyphs are drawable changes.

#### Scenario: First frame waits for fonts
- **WHEN** a scene declaring a url font mounts in `usePlayer`
- **THEN** `status` becomes `'ready'` only after the engine font load has settled and the first frame is buffered

#### Scenario: Failing font does not fail playback
- **WHEN** a declared font URL fails to load into the engine
- **THEN** `status` still becomes `'ready'` and playback proceeds (that family simply has no glyphs)

#### Scenario: Path-only entries are ignored by the player
- **WHEN** a scene declares a font with only `src.path`
- **THEN** the player does not attempt to load it (fetch-by-URL only)
