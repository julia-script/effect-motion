# Tasks

## 1. Scene and frame contract

- [x] 1.1 Add typed `Scene.setMask`/`clearMask` and Runner attachment state without changing tree ownership; verify TypeScript accepts paintable sources/targets and rejects Camera.
- [x] 1.2 Serialize deterministic `Frame.masks` references and verify attach, replace, clear, independent animation, repeated runs, and exact endpoints in core tests.
- [x] 1.3 Validate mounted endpoints, unique source ownership, ancestry, cycles, composition/tier domain, and detach/reparent/destroy behavior, including orphaned descendants after ancestor destruction; verify named diagnostics and source restoration in core tests.

## 2. Retained mask rendering

- [ ] 2.1 Extend the shared frame walk to resolve source-only subtrees, composed transforms, nested mask dependencies, and per-comp/per-tier domains; verify nested source-root suppression, one-time ancestor mask factors, retained scene structure, and invalid-frame diagnostics in renderer tests.
- [ ] 2.2 Render shape, stroke, glyph Text, Image, and Group source alpha to reusable transparent coverage targets while keeping target drawables at their native fragment depth; verify RGB independence, partial alpha, visibility, and source-only output in renderer tests.
- [ ] 2.3 Multiply normal/inverse mask factors per target fragment, including inherited Group and nested factors, while preserving global depth interleaving; verify overlap and independent source/target movement in renderer tests.
- [ ] 2.4 Add mask-aware opaque/fractional fragment variants to fill, world-unit stroke, Image, glyph Text, and comp-plane drawables, plus temporary DoF depth lending on fractional variants; verify a partially transparent Rect and near/far translucent subpaths of one masked Path around an opaque sibling, including behind-object visibility, per-fragment depth order, zero-alpha holes, and focus in renderer tests and visual frames.
- [ ] 2.5 Integrate world/HUD and nested composition passes, including masks inside a child comp and on its parent plane; verify camera movement, bounds, sharp HUD, and parent-only comp focus in browser and Node frames.
- [ ] 2.6 Reuse stable mask targets/materials and release owned resources on replacement, clear, disappearance, resize, and renderer close; verify lifecycle instrumentation or retained-resource tests and the unmasked fast path.

## 3. Delivery and integration

- [ ] 3.1 Add a mask guide and runnable examples for normal, inverse, partial alpha, leaf and Group targets, and independent animation; verify examples build and render.
- [ ] 3.2 Run `rtk bun run check`, `rtk bun run test`, `rtk bun run lint`, and `rtk bun run build`; verify browser playback and headless export visually for mask modes, transparency, text/image sources, nested Groups/comps, cameras, HUD, depth, and depth of field, recording the actual results and evidence.
