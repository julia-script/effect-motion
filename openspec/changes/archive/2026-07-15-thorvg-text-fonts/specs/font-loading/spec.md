# Spec: font-loading

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Export maps declared fonts to resvg options
**Reason:** resvg is gone — the export path now renders through the ThorVG engine (`renderToPng`), which loads fonts by URL like every other ThorVG consumer (see the `thorvg-text` capability's "scene's declared fonts reach the engine" requirement). There is no resvg font-file mapping to specify.
