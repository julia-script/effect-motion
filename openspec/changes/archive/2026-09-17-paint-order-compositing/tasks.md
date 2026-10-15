## 1. Metadata and compatibility

- [x] 1.1 Add Scene compositing metadata and the Group inherit/paint field; verify schema defaults and compile-time accepted values with focused core tests.
- [x] 1.2 Carry root and mounted scene modes through frames, Scene.play and replay; verify a depth root containing a paint child retains both modes and existing frame counts.
- [x] 1.3 Inventory depth-dependent examples/templates and mark explicit depth mode; verify the inventory and a before/after 3D occlusion control are recorded in this change.

## 2. Paint pass and retained ordering

- [x] 2.1 Assign traversal and fill/stroke paint ranks from current children arrays; verify reversing existing siblings updates ranks without recreating their geometry.
- [x] 2.2 Configure a common paint sequence with internal depth rejection disabled for fills, strokes, images and text; verify a zero-z background/Rect/Text fixture and an opacity 0-to-1 sweep keep the declared order.
- [x] 2.3 Apply context policy to custom render implementations and mounted surfaces; verify a custom implementation of a built-in entity follows surrounding sibling order.
- [x] 2.4 Keep depth-context sorting and HUD separation explicit; verify far/near 3D controls, inherited-group interleaving and HUD-over-world behavior remain correct.

## 3. Embedded paint groups

- [x] 3.1 Add retained paint-group contexts and compute local bounds including strokes, text, images and nested surfaces; verify negative coordinates, empty groups and thick outlines have correct extents.
- [x] 3.2 Reuse composition target lifecycle for paint groups and preserve fractional bounds origins; verify moving/resizing children causes neither clipping nor a shift in authored placement.
- [x] 3.3 Apply the group's position, rotation and scale once to its composite surface; verify a tilted/scaled paint group in a depth scene retains its internal order and obeys external depth.
- [x] 3.4 Composite group opacity once and exclude transparent texels from occlusion; verify overlap-at-0.5 and an outlined group with a world object visible through its hole.
- [x] 3.5 Handle target sizing, nested removal, explicit mode changes and disposal; verify allocation counts stabilize under repeated resize/reparent/remove cycles and unsupported allocation reports the context.

## 4. Integration and documentation

- [x] 4.1 Extend the border lab with zero-z order, sibling reorder, embedded-group and depth controls at the docs' 1920×1080 size; verify each case is labeled and reproducible at fixed frames.
- [x] 4.2 Compare fresh seeks, sequential playback and Node export; verify matching visible layering and structural order without pixel-byte assertions.
- [x] 4.3 Document paint/depth semantics, Group boundaries, migration and the remaining stroke-quality work; verify examples typecheck and a breaking changeset names the new default.
- [x] 4.4 Run checks/tests for touched core, renderer, three and docs packages plus formatting; record commands and browser/Node visual evidence with all relevant scenarios passing.
