# font-loading Specification (delta)

## ADDED Requirements

### Requirement: Scenes declare fonts via the Fonts annotation
`@effect-motion/motion` SHALL provide a `Fonts` module with a `FontResource` type — `family` (string, required), `src` (object with optional `url` and `path` strings), optional `weight` (number) and `style` (`"normal"` | `"italic"`) — and an annotation key for `ReadonlyArray<FontResource>` usable with the existing `scene.annotate` mechanism. The module SHALL provide an accessor that reads a scene's declared fonts, returning an empty array when the annotation is absent. The runtime SHALL NOT read the annotation: frame production for an annotated scene is identical to the same scene without the annotation.

#### Scenario: Declaring fonts on a scene
- **WHEN** a scene is annotated with `[{ family: "Inter", src: { url: "/fonts/inter.woff2" } }]`
- **THEN** the accessor returns that array from the annotated scene value

#### Scenario: Undeclared scenes read as empty
- **WHEN** the accessor is applied to a scene that was never annotated with fonts
- **THEN** it returns an empty array

#### Scenario: Annotation does not affect frames
- **WHEN** the same scene is run with and without a fonts annotation
- **THEN** both runs produce identical frame data

### Requirement: Player loads declared fonts before ready
`usePlayer` SHALL read the scene's fonts annotation and, for every entry carrying a `src.url`, load a `FontFace` (constructed with the entry's `family`, url source, and `weight`/`style` descriptors when present) into `document.fonts`, concurrently with initial frame buffering. `status` SHALL remain `'loading'` until both the first frame is buffered and every attempted font load has settled. An individual font load failure SHALL NOT fail playback or block readiness. Entries without a `src.url` SHALL be skipped. Rendered markup SHALL be unchanged by font loading.

#### Scenario: First frame waits for fonts
- **WHEN** a scene declaring a url font mounts in `usePlayer`
- **THEN** `status` becomes `'ready'` only after the font load has settled and the first frame is buffered

#### Scenario: Failing font does not fail playback
- **WHEN** a declared font URL fails to load
- **THEN** `status` still becomes `'ready'` and playback proceeds with the browser's normal fallback

#### Scenario: Path-only entries are ignored by the player
- **WHEN** a scene declares a font with only `src.path`
- **THEN** the player attempts no load for it and readiness is unaffected

### Requirement: Export maps declared fonts to resvg options
`@effect-motion/export` SHALL provide a helper that reads a scene's fonts annotation and returns resvg font options whose `fontFiles` lists the `src.path` of every entry that has one, suitable for passing to `Resvg.rasterize`/`rasterizeToFile`. Entries without a `src.path` SHALL be skipped. The helper SHALL NOT set `loadSystemFonts` — resvg's default (system fonts loaded) applies unless the consumer overrides it explicitly.

#### Scenario: Path entries become fontFiles
- **WHEN** the helper is applied to a scene declaring `{ family: "Inter", src: { path: "./fonts/Inter.ttf" } }`
- **THEN** the returned options carry `fontFiles` including `"./fonts/Inter.ttf"`, and rasterizing the scene's SVG with them renders text in Inter

#### Scenario: Url-only entries are ignored by export
- **WHEN** the helper is applied to a scene whose only font entry has just a `src.url`
- **THEN** the returned options list no font files and rasterization behaves as without the annotation

#### Scenario: System fonts remain available by default
- **WHEN** the helper's options are passed to `rasterize` without further overrides
- **THEN** families not covered by `fontFiles` still resolve through system fonts
