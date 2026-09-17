## Context

See [proposal.md](proposal.md) for motivation. The existing renderer already walks ordered children, but `Sync.diffRetained` attaches objects on first appearance without updating an explicit paint rank. `Builtins.setColor` puts shape materials in the transparent path; relying on object creation order or the library's sort therefore does not establish the authoring contract.

`Sync.syncComp` and `Renderer.renderCompTargets` provide reusable retained composition targets. They currently derive child views from an identity camera, and the composition transform holder is reset to identity. Reuse their lifecycle and target plumbing, not the assumption that existing composition transforms already meet the new contract.

The main specs contain older wording about sized Groups and global depth ordering. The deltas deliberately reconcile the affected requirements with the current children-defined model. The separate unfinished center-origin change is not absorbed here; retain the implementation's center-origin, y-up coordinates.

## Goals / Non-Goals

**Goals:** explicit context semantics; correct 2D order without z edits; a paint surface inside a depth scene; retained resources; consistent browser/export behavior.

**Non-Goals:** automatic 2D detection, general order-independent 3D transparency, changing intersection behavior among independent 3D objects, arbitrary nonplanar groups that remain volumetric after flattening, or solving stroke-internal alpha/coverage in this change.

## Decisions

### 1. Mode is authored metadata

Add scene `compositing: "paint" | "depth"` with paint as the new default, and Group `compositing: "inherit" | "paint"` with inherit as its default. Carry the scene mode in frames and mounted composition metadata so seeking and export do not guess.

A depth scene has to say depth explicitly. An inherited Group has no boundary of its own. An explicit paint Group defines a local surface. We do not add a second hierarchy, public Group bounds, a z-index field or arity-dispatched helpers.

A child z/rotation still affects its projected appearance in a paint context, but never its paint priority. Projection and occlusion are separate decisions. Mode does not change when a child passes through z=0. To embed a depth composition in a paint scene, use an explicitly depth-configured child scene through the existing Scene.play mount, which already represents a separate composition.

Alternatives: coordinate heuristics would switch behavior during animation; making all Groups isolate would break useful 3D interleaving. Keeping depth as the scene default would leave ordinary authoring dependent on an extra opt-in, contrary to the intended 2D default.

### 2. Paint operations are ordered within one rendering context

Generate a stable traversal rank from current children order, then a local fill/stroke rank per leaf. Apply ordering metadata every frame even when data/world-position identity allows geometry updates to be skipped. Rank follows the authored tree, never GPU ids or allocation history.

Within a paint pass, disable internal depth testing/writing and ensure every participating material follows one consistent paint sequence, including fully opaque fills, text, images, strokes and nested surfaces. Do not let opaque/transparent queue changes reorder a fading entity. A controlled common queue is the initial approach; custom render implementations must receive the same context/order policy.

Root paint scenes can draw directly into their output target. They need not allocate a redundant texture. Inherited groups flatten into that traversal; explicit paint groups occupy one slot. Their local surface is rendered before it is consumed by the parent.

Alternative: renderOrder alone leaves depth rejection intact and does not unify opaque and transparent queues. World-space epsilon offsets alter authored placement and cannot express an ordered 2D surface robustly.

### 3. An embedded paint group is a retained local surface

Rasterize the group's children in local coordinates using a canonical local view, with a transparent background and normal fill/stroke paint order. Composite the result once at the group's parent-space transform. Apply translation, rotation and scale to this surface; avoid applying the group transform both inside and outside the target.

In a depth parent, the surface participates in normal external depth occlusion. Fully transparent texels must be discarded before any depth write; an empty texture rectangle must not become an invisible occluder. Fractional-alpha blending remains subject to the existing depth scene's transparent-object limitations. No claim of general intersecting-transparent-surface correctness is added.

Apply explicit paint-group opacity to the composite once. A nested explicit group gets its own boundary and opacity application. Keep independent strokes as distinct paints; this surface does not repair alpha accumulated inside a stroke.

HUD placement and camera independence remain as currently specified. A paint group may live within HUD content; this change does not redesign HUD depth semantics or allow world-nested Hud entities.

### 4. Bounds and target sizing are renderer state

Group bounds come from current projected child extents, including actual text/image extents, transformed corners, stroke widths and AA padding. Nested surfaces contribute their bounds. Empty/hidden groups need no visible surface. Scene.play retains declared scene bounds and clipping; an unsized paint Group is not clipped to a Scene-like public size.

Track the local bounds origin separately from raster allocation dimensions. A child moving the minimum bound must not shift the group or snap its geometry. Include off-center and negative-coordinate cases. Reuse or resize targets, clear them correctly, and dispose departed contexts using the owning renderer's scoped lifecycle.

Set baseline target density from final viewport scale/DPR and projected surface magnification. Allocation dimensions may be integral; authored positions and widths stay fractional. Device-limit failures must be reported with context instead of silently cropping. Detailed AA resolution policy is refined by subpixel-stroke-coverage.

Implementation ownership: Scene/Entity own serializable metadata; Sync owns context traversal/retained surfaces; a renderer Paint actor can own paint-context operations; three wrapper modules own raw GPU APIs and typed boundary failures. Keep one actor per module and avoid a general helper framework.

### 5. Validation focuses on authoring semantics

Use structural assertions for rank/context metadata and frame determinism. Visually inspect: background + Rect + Text all at z=0; opaque/fading sibling reordering; a nested paint group with overlap and opacity 0.5; transparent holes in front of a world object; animated bounds; tilted/scaled paint surfaces; depth-scene controls in both child orders.

Use the existing border lab as a fixture seed. Normalize newly revised docs examples to the documented 1920×1080 convention while preserving labeled sample dimensions. Compare browser and Node by appearance, not exact pixels.

## Risks / Trade-offs

- [Default changes existing 3D scenes] → Mark as breaking, explicitly migrate all known depth-dependent examples and document the one-option opt-in.
- [Offscreen surfaces blur when magnified] → Size for projected output density, retain a native-scale comparison, and integrate subpixel coverage work before declaring border quality complete.
- [Bounds or transparent quad hides content] → Test thick strokes, holes, negative coordinates, rotations and changing bounds; discard non-covered surface pixels.
- [Large/nested surfaces consume memory] → Reuse resources, bound allocation by device limits, and check live allocation counts during resize/removal loops.
- [Existing composition transform gaps] → Implement the explicit surface's transform contract; do not assume current syncComp already supports it.
- [Adjacent proposals modify motion-renderer] → This change owns frame pipeline/direct-paint/composition requirements; stroke-opacity-union owns Path/union requirements; subpixel adds separate coverage requirements.

## Migration Plan

1. Implement explicit depth mode while preserving current depth behavior.
2. Implement paint root passes and Group paint boundaries, then switch new scene metadata defaults to paint.
3. Mark existing depth-dependent docs, templates and integration fixtures with depth; update authoring guidance and add a breaking changeset.
4. Validate both adapters, fresh seeks and nested mounts, then integrate stroke-opacity-union and subpixel-stroke-coverage.
5. Before release, rollback is removal of the change; after adoption, depth mode preserves the old world-occlusion behavior for migrating scenes. Do not silently reclassify users' scenes.

## Open Questions

- The exact target-size reuse bucket and magnification ceiling can be chosen from the bounds/zoom fixtures without changing context semantics.
