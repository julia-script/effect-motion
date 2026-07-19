# thorvg-fonts Specification (delta)

## ADDED Requirements

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
