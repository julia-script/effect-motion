# thorvg-images Delta Specification

## REMOVED Requirements

### Requirement: Picture loading from encoded data
**Reason**: `@effect-motion/thorvg` is deleted; images decode into three textures, not ThorVG pictures.
**Migration**: `image-assets` delta — decode-once-per-renderer-scope into textures.

### Requirement: Raw pixel loading
**Reason**: Package deleted.
**Migration**: Three texture creation from decoded pixels, if ever needed, is a wrapper concern (`three-runtime`).

### Requirement: Picture size and origin
**Reason**: Package deleted.
**Migration**: Natural size comes from the decoded image; placement semantics live in `image-assets`.

### Requirement: Picture data is paint-tier
**Reason**: Package deleted.
**Migration**: Textures are renderer-tier resources managed by the retained registry's dispose (`motion-renderer`).
