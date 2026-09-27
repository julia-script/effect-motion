## 1. Renderer

- [x] 1.1 Compose full TRS transforms and ancestor opacity in the `Sync.ts` walk; `Leaf.transform`
- [x] 1.2 Diff on frame data + ancestor opacity + composed transform
- [x] 1.3 Planar builtins (fills, Text, Image, particles) place from the composed transform; billboard iff unrotated
- [x] 1.4 Line/Path map local points through the composed matrix; Path triangulates in local space
- [x] 1.5 Scene.play comps honor the group's transform and ancestor opacity

## 2. Animators

- [x] 2.1 `Motion.scale`/`scaleTo`, `Motion.rotate`/`rotateTo` as base/To duals

## 3. Verification

- [x] 3.1 Structural renderer tests: scaled/rotated shape, rotated+scaled Group carrying children, nested composition, Group opacity
- [x] 3.2 Headless GPU pixel test and a viewed contact sheet
- [x] 3.3 Animator tests land exactly on target
