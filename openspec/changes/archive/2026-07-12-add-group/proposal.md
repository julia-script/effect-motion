# Add Group Hierarchy

## Why

Scenes are flat: every instance renders at top level in viewport coordinates, so there is no way to move, fade, or organize shapes together. A Group entity with children turns the frame into a tree — grouped transforms (move the group, children follow), controllable paint order, and the structural foundation the future camera slots into (a camera is plausibly just a transform at the root).

## What Changes

- **New `shapes/Group.ts`**: a container entity — `x`, `y`, `opacity`, and `children` (an array of instance ids as plain schema data). Groups position and structure; they paint nothing themselves.
- **BREAKING — frame shape**: `Frame` becomes `{ instances, root }`. The Runner creates a root Group at startup with the conventional id `"root"`; `state` returns the root id alongside the flat instances record.
- **`Scene.instantiate(entity, props, { parent? })`**: new optional parent (a Group instance), defaulting to the root group — the new instance's id is appended to the parent's `children`, so every instance is born attached exactly once (no orphans, no double-attachment). `destroy` strips the id from any group that references it.
- **Hierarchy is data**: `children` is ordinary schema data, so `Scene.update` on a group can reparent and reorder (z-order) with no new API. Helper combinators for building complex structures come later.
- **BREAKING — renderer contract**: the generic frame renderer walks the tree post-order from the root; `RenderFunction`'s payload gains `children: ReadonlyArray<RenderEntitySuccess>` (rendered child output — leaf renderers ignore it). The root group itself does not render: its children are the top-level entries handed to `config.render`, so the sink signature and both SVG sinks are untouched.
- **Traversal defects**: an id referenced by more than one group (or a cycle), and a referenced id that doesn't exist (dangling after destroy or a typo) die loudly with the offending id.
- **Coordinates become local**: a child's `x`/`y` is relative to its containing group (SVG: groups render as `<g transform="translate(x y)" opacity>`; the target composes transforms — no absolute-position math in library code). Top-level instances are unchanged (root sits at the origin).
- SVG manifest gains the `group` entry; demo/playground show a grouped move.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `shapes`: gains the Group container requirement (definition, children-as-data, instantiate attachment defaulting to root).
- `svg-rendering`: "Absolute positioning" becomes local-to-parent positioning; gains hierarchical rendering (post-order traversal, group materialization, traversal defects).

## Impact

- `src/shapes/Group.ts` (new) + shapes index; `src/Runner.ts` (root creation, parent attachment, destroy cleanup, state shape); `src/Scene.ts` (instantiate options, `Frame` type); `src/Renderer.ts` (traversal, `RenderFunction` payload); `src/svg/shapes.ts` (group entry).
- Tests: group rendering through both sinks, nesting, defects, reparent/reorder via update; existing tests updated for the frame shape.
- demo/playground additions. No dependency changes.
