## 1. Renderer

- [x] 1.1 Compose full TRS transforms and ancestor opacity in the `Sync.ts` walk; `Leaf.transform`
- [x] 1.2 Diff on frame data + ancestor opacity + composed transform
- [x] 1.3 Planar builtins (fills, Text, Image, particles) place from the composed transform; billboard iff unrotated
- [x] 1.4 Line/Path map local points through the composed matrix; Path triangulates in local space
- [x] 1.5 Scene.play comps honor the group's transform and ancestor opacity
- [x] 1.6 Stroke widths scale by the narrower planar `|scale|`; a collapsed shape draws nothing (dogfood: a `{x:0, y:0.004}` Rect left its default black stroke as a bar)

## 2. Animators

- [x] 2.1 `Motion.scale`/`scaleTo`, `Motion.rotate`/`rotateTo` as base/To duals

## 3. Paint order

- [x] 3.1 Tree-order homothety nudge per leaf/comp (`Sync.syncLayers`), reversed-Z float depth (both render paths + comp targets)
- [x] 3.2 Opacity < 1 materials don't write depth; drop Text's z-lift
- [x] 3.3 Depth of field (main's depth-aware DoF): see-through materials write depth for the DoF render only (`Sync.withSeeThroughDepth`), so they blur at their own depth; reversed-Z depth is linearized by three's `perspectiveDepthToViewZ` (honours `reversedDepthBuffer`), pinned by a both-sides-of-focus Dawn test

## 4. Verification

- [x] 4.1 Structural renderer tests: scaled/rotated shape, rotated+scaled Group carrying children, nested composition, Group opacity
- [x] 4.2 Headless GPU pixel test and a viewed contact sheet
- [x] 4.3 Animator tests land exactly on target
- [x] 4.4 Headless pixel tests: zero/near-zero scale on Rect, Circle, Text, Group draws nothing / a fill-colored sliver
