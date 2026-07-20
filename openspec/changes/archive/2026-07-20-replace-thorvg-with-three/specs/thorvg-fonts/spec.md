# thorvg-fonts Delta Specification

## REMOVED Requirements

### Requirement: Scoped, refcounted font loading
**Reason**: `@effect-motion/thorvg` is deleted; fonts no longer load into a wasm engine.
**Migration**: Fonts resolve through the SDF text path (`three-text`); the declaration/loading contract lives in `font-loading`.

### Requirement: Conflicting sources fail loudly
**Reason**: Package deleted.
**Migration**: Source-conflict validation, where still applicable, belongs to the `Font` resource loader (`resource-loaders`).

### Requirement: TrueType and OpenType formats
**Reason**: Package deleted; supported formats are now those of the SDF text stack.
**Migration**: `three-text` font fidelity requirement governs format support.

### Requirement: Failed font loads are logged skips
**Reason**: Package deleted.
**Migration**: Loader failures surface through the player/export error channel (loud), per `react-player` loader-failure requirements.

### Requirement: Byte-source scoped acquisition
**Reason**: Package deleted.
**Migration**: Loader bytes feed the SDF text path directly (`three-text`).

### Requirement: No implicit default font at engine acquire
**Reason**: Package deleted; no engine acquire step exists.
**Migration**: The embedded default font is provided by the three text path (`three-text`), loaded with the renderer, not implicitly at engine acquisition.
