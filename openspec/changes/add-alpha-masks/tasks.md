# Tasks

## 1. Scene and frame contract

- [ ] 1.1 Add typed `Scene.setMask`/`clearMask` and Runner attachment state without changing tree ownership; verify TypeScript accepts paintable sources/targets and rejects Camera.
- [ ] 1.2 Serialize deterministic `Frame.masks` references and verify attach, replace, clear, independent animation, repeated runs, and exact endpoints in core tests.
- [ ] 1.3 Validate mounted endpoints, unique source ownership, ancestry, cycles, composition/tier domain, and detach/reparent/destroy behavior, including orphaned descendants after ancestor destruction; verify named diagnostics and source restoration in core tests.

## 2. Retained mask rendering

- [ ] 2.1 Extend the shared frame walk to resolve source-only subtrees, composed transforms, nested mask dependencies, and per-comp/per-tier domains; verify nested source-root suppression, one-time ancestor mask factors, retained scene structure, and invalid-frame diagnostics in renderer tests.
- [ ] 2.2 Capture native fill, stroke, glyph Text, image, and composition-plane color/alpha plus independent coverage-aware geometry depth through one masked-leaf seam, and render source alpha to reusable transparent targets; verify intrinsic alpha `0.5` still records target depth, zero-alpha fragments do not, RGB independence, visibility, and source-only output in renderer tests.
- [ ] 2.3 Multiply normal/inverse mask factors per target fragment, including inherited Group and nested factors, while preserving global depth interleaving; verify overlap and independent source/target movement in renderer tests.
- [ ] 2.4 Implement geometry-depth proxy fragment classification for opaque/zero/fractional coverage, native depth ordering, and temporary DoF depth lending on fractional proxies; verify fills, strokes, images, glyph Text, comp planes, and a partially transparent masked target at a depth distinct from siblings/background, including behind-object visibility, opaque occlusion, draw order, and focus in renderer tests and visual frames.
- [ ] 2.5 Integrate world/HUD and nested composition passes, including masks inside a child comp and on its parent plane; verify camera movement, bounds, sharp HUD, and parent-only comp focus in browser and Node frames.
- [ ] 2.6 Reuse stable mask targets/materials and release owned resources on replacement, clear, disappearance, resize, and renderer close; verify lifecycle instrumentation or retained-resource tests and the unmasked fast path.

## 3. Delivery and integration

- [ ] 3.1 Add a mask guide and runnable examples for normal, inverse, partial alpha, leaf and Group targets, and independent animation; verify examples build and render.
- [ ] 3.2 Run `rtk bun run check`, `rtk bun run test`, `rtk bun run lint`, and `rtk bun run build`; verify browser playback and headless export visually for mask modes, transparency, text/image sources, nested Groups/comps, cameras, HUD, depth, and depth of field, recording the actual results and evidence.
