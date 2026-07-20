# thorvg-text Delta Specification

## REMOVED Requirements

### Requirement: Text and font C-API are wrapped
**Reason**: `@effect-motion/thorvg` is deleted; text renders via SDF glyphs in the three renderer.
**Migration**: `three-text`.

### Requirement: Fonts load into the engine from URLs
**Reason**: Package deleted; there is no engine font table.
**Migration**: Declared `Font` resources feed the SDF text path (`three-text`); the declaration contract stays in `font-loading`.

### Requirement: The per-frame render preserves the engine font table
**Reason**: Package deleted; no engine font table exists.
**Migration**: None needed — SDF glyph atlases persist with the renderer scope.

### Requirement: The scene's declared fonts reach the engine
**Reason**: Package deleted.
**Migration**: Declared fonts reach the three text path through the same loader-in-context mechanism; the loud-defect backstop stays in `font-loading`.

### Requirement: Text renders through the ThorVG renderer
**Reason**: Renderer replaced.
**Migration**: `three-text` rendering requirements (SDF, fidelity, anchor/baseline).
