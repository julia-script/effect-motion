# Proposal

## Why

Authors can animate a shape and its content, but cannot use one to reveal or hide the other. Alpha masks add that familiar motion-graphics operation while retaining deterministic frame data and the existing instance tree.

## What Changes

- Add a typed `Scene.setMask(target, source, options?)` operation and `Scene.clearMask(target)` for drawable instances and groups. The source is an ordinary, independently animatable instance; while referenced as a mask it contributes coverage only.
- Support normal and inverse alpha masks, including partial opacity from colors, images, text, and group descendants.
- Carry mask references in frames and render them in the world, HUD, and nested-composition paths. Preserve unmasked depth ordering, group transforms, and existing composition boundaries.
- Validate invalid references and cycles with named diagnostics; retain and release mask render resources with the renderer.
- Document the API and add runnable normal, inverse, and partially transparent examples.

## Capabilities

### New Capabilities

- `alpha-masks`: Mask authoring, frame state, source visibility, projection and composition boundaries, alpha/depth behavior, validation, and renderer lifecycle.

### Modified Capabilities

None. The mask behavior is additive and specified in `alpha-masks`; existing requirements for unmasked content remain unchanged.

## Impact

The core scene and runner API, `Frame` data, the retained renderer shared by browser and Node, resource resolution for image/text mask sources, and documentation/examples change. No new animation engine, entity kind, or structural child tree is introduced. Luminance masks, dedicated feather controls, and Boolean mask operations are outside this change.
