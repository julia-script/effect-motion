# font-loading (delta)

## MODIFIED Requirements

### Requirement: Player loads declared fonts before ready
The player SHALL read the scene's fonts annotation and, for every entry carrying a `src.url`, acquire that family→URL through the ThorVG render session's scoped font registry (per the thorvg-fonts capability) so the engine loads the font (fetched by URL; TrueType or OpenType), concurrently with initial frame buffering. `status` SHALL remain `'loading'` until both the first frame is buffered and every attempted font load has settled. An individual font load failure SHALL NOT fail playback or block readiness. Entries without a `src.url` SHALL be skipped (no filesystem). When the player unmounts, its font acquisitions SHALL be released (refcounted; the registry drops its hold on a family only when no other holder remains — engine unload is best-effort per the thorvg-fonts capability). Rendered output SHALL be unchanged by whether a given font loaded — only which glyphs are drawable changes.

#### Scenario: First frame waits for fonts
- **WHEN** a scene declaring a url font mounts in the player
- **THEN** `status` becomes `'ready'` only after the engine font load has settled and the first frame is buffered

#### Scenario: Failing font does not fail playback
- **WHEN** a declared font URL fails to load into the engine
- **THEN** `status` still becomes `'ready'` and playback proceeds (that family simply has no glyphs)

#### Scenario: Path-only entries are ignored by the player
- **WHEN** a scene declares a font with only `src.path`
- **THEN** the player does not attempt to load it (fetch-by-URL only)

#### Scenario: Unmount releases fonts without breaking siblings
- **WHEN** two mounted players declare the same family+URL and one unmounts
- **THEN** the remaining player's text keeps rendering, and the registry's hold on the family reaches zero only after the second player unmounts
