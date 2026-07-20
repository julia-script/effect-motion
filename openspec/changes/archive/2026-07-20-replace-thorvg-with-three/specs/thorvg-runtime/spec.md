# thorvg-runtime Delta Specification

## REMOVED Requirements

### Requirement: Scoped module acquisition
**Reason**: `@effect-motion/thorvg` is deleted with the ThorVG → three.js replacement.
**Migration**: `@effect-motion/three`'s scoped renderer lifecycle (`three-runtime`).

### Requirement: Paint lifecycle via acquireRelease
**Reason**: Package deleted; no C-API paint handles exist in the three renderer.
**Migration**: Retained objects are managed by the `build`/`update`/`dispose` registry (`motion-renderer`).

### Requirement: Ownership transfer on add
**Reason**: Package deleted; three's scene-graph ownership is plain JS garbage collection plus explicit GPU-resource dispose.
**Migration**: `motion-renderer` retained-diff dispose semantics.

### Requirement: Typed error mapping from result codes
**Reason**: Package deleted; no C result codes.
**Migration**: `three-runtime` tagged errors at async boundaries.

### Requirement: Scoped scratch memory
**Reason**: Package deleted; no wasm heap to manage.
**Migration**: None needed.

### Requirement: Raw-pointer boundary
**Reason**: Package deleted; no wasm pointers.
**Migration**: None needed.

### Requirement: End-to-end draw with cleanup
**Reason**: Package deleted.
**Migration**: `three-runtime` scoped lifecycle + `motion-renderer` retained scene cover draw-and-cleanup.

### Requirement: Keeper canvas pins the engine
**Reason**: Package deleted; no engine-refcount semantics in three.
**Migration**: None needed.

### Requirement: Session-scoped canvases
**Reason**: Package deleted.
**Migration**: Renderer scope in `three-runtime`.

### Requirement: Render session bundles canvas and fonts
**Reason**: Package deleted; resource bundling moves to the three renderer's scope.
**Migration**: Loaders provided via Effect context to the three renderer; fonts via `three-text`.
