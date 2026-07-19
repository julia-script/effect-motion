# thorvg-fonts Specification

## Purpose
Engine-level font loading as a refcounted, session-scoped resource over the ThorVG wasm engine, in the bindings-only `@effect-motion/thorvg` package.
## Requirements
### Requirement: Scoped, refcounted font loading
The thorvg package SHALL expose font loading as a scoped resource: acquiring a font (family + source) loads it into the engine when that family's refcount goes 0→1 and only increments the count otherwise; releasing decrements the count. When the count reaches zero the registry SHALL attempt an engine unload (`_tvg_font_unload`) and, because the current wasm build cannot unload data-loaded fonts (`NotSupported`), SHALL retain a tombstone for the family when the engine refuses — a later same-source acquisition then succeeds without re-uploading, and conflicting sources stay blocked. The registry SHALL be keyed per wasm module (surviving engine recreation, e.g. HMR) so it cannot desync from the actual engine state, and SHALL be cleared when the engine is terminated.

#### Scenario: Two sessions share one load
- **WHEN** two concurrent sessions acquire the same family from the same source
- **THEN** the font bytes are fetched and loaded into the engine exactly once

#### Scenario: Last release forgets the hold
- **WHEN** the last session holding a family releases it
- **THEN** the registry's count reaches zero, an engine unload is attempted, and a later same-source acquisition succeeds without a second engine upload

#### Scenario: Earlier release does not unload
- **WHEN** one of two sessions holding a family releases it
- **THEN** the font remains loaded and text using it still renders

#### Scenario: Registry keyed per module
- **WHEN** the engine module is recreated and a family is acquired again
- **THEN** the registry treats it as not loaded and loads it into the new module

### Requirement: Conflicting sources fail loudly
Acquiring a family that the engine holds from a different source SHALL fail with a typed `ThorvgException` naming the family and both sources — including when the earlier holder count is zero but the engine retained the bytes (tombstone). Identical family+source acquisitions SHALL deduplicate, never conflict.

#### Scenario: Same family, different source
- **WHEN** family "Inter" is held from source A and a session acquires "Inter" from source B
- **THEN** the acquisition fails with an error naming "Inter", source A, and source B

#### Scenario: Same family, same source
- **WHEN** family "Inter" is held from source A and a session acquires "Inter" from source A
- **THEN** the acquisition succeeds without a second engine load

### Requirement: TrueType and OpenType formats
Font loading SHALL accept both TrueType and OpenType data (the engine's loader dispatch accepts the `ttf` and `otf` mimetypes), defaulting the format by sniffing the file's magic bytes (`OTTO` → otf, otherwise ttf) with an explicit format option as override.

#### Scenario: OTF loads without configuration
- **WHEN** OpenType bytes (magic `OTTO`) are loaded without a format option
- **THEN** the font is loaded with the `otf` mimetype and succeeds

#### Scenario: TTF remains the default
- **WHEN** TrueType bytes are loaded without a format option
- **THEN** the font is loaded with the `ttf` mimetype and succeeds

### Requirement: Failed font loads are logged skips
A failed fetch or engine load for one family SHALL NOT fail the acquiring session: the failure is logged naming the family and source, the family simply has no glyphs, and other fonts in the same acquisition load normally. (Conflicts per the conflict requirement are the exception: those fail loudly.)

#### Scenario: One bad URL among several fonts
- **WHEN** a session acquires three families and one URL returns 404
- **THEN** the other two load, the failure is logged, and the session opens

### Requirement: Byte-source scoped acquisition
The scoped font registry SHALL accept in-memory bytes as a source, identified by a caller-supplied source identity (the resource id or an equivalent stable key), with the same refcount, dedup, tombstone, and conflict semantics as URL sources: identical family+identity acquisitions deduplicate; a family held under a different identity fails loudly per the existing conflict requirement. Format handling (magic-byte sniffing with explicit override) applies to byte sources unchanged.

#### Scenario: Two sessions share one byte upload
- **WHEN** two concurrent sessions acquire the same family from bytes under the same source identity
- **THEN** the bytes are uploaded to the engine exactly once

#### Scenario: Byte source conflicts with a different source
- **WHEN** family "Inter" is held from one source identity and a session acquires "Inter" from a different one
- **THEN** the acquisition fails with an error naming the family and both identities

### Requirement: No implicit default font at engine acquire
Engine acquisition SHALL NOT auto-load any font: when no fonts are supplied, the engine starts with an empty font table and performs no network fetch. The previous `DEFAULT_FONT_URL` fallback is removed; default-font provision is the motion render path's responsibility (see `resource-loaders`).

#### Scenario: Bare engine acquire fetches nothing
- **WHEN** the engine is acquired with no font configuration
- **THEN** no font is loaded and no network request is made

