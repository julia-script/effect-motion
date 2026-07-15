## 1. Projection core (proof of concept) — LANDED

- [x] 1.1 Add `packages/motion/src/Projection.ts`: pure, dependency-free view basis + reference-plane perspective/orthographic projection (`viewBasis`, `projectWith`, `project`) with behind-camera culling
- [x] 1.2 Add deterministic painter's-order sort `depthOrder(items, depthOf)` (depth desc, explicit original-index tiebreak; no reliance on `Array.sort` stability)
- [x] 1.3 Add `packages/motion/test/projection.test.ts`: reference-plane size, axis mapping, perspective grow/shrink, vanishing-point pull, orthographic flat-but-ordered, behind-camera culling, camera-decides-order, camera-flip-reverses-order, deterministic tie-break (9 cases, green)

## 2. z axis on `~position` (BREAKING)

- [ ] 2.1 `shapes/Shape2D.ts`: `position` gains `z` (`defaultedNumber(0)`); `positionLens<Data extends {x,y,z}>()` reads/writes x/y/z
- [ ] 2.2 Confirm `move`/`moveTo`/`spring`/`springTo` drive z through the lens with no new animators; `tween("z", …)` works as a raw numeric field
- [ ] 2.3 `Group` position lens carries z so a group offsets its subtree in 3D (subtree keeps local coords)
- [ ] 2.4 Tests: `traits.test.ts` (`~position` is `{x,y,z}`, partial `moveTo` leaves z), `motion.test.ts` (z tween lands exactly), `group.test.ts` (group z offsets children)

## 3. Free 3D camera (BREAKING)

- [ ] 3.1 `Camera.ts`: replace `{x, y, zoom}` with `position`/`target`/`up`/`projection`; export `viewBasis` re-used from `Projection.ts`; `IDENTITY`/`CameraState` updated
- [ ] 3.2 `Runner.ts`: `cameraState()` and the default identity camera produce the new shape; `FrameMeta.camera` / `Frame.camera` types updated; camera still omitted from the render tree
- [ ] 3.3 Decide the aim surface (OQ1): raw `tween` on `targetX/Y/Z` and/or a `Camera.lookAt` helper; ship the base/To story for whatever lands
- [ ] 3.4 Tests: `camera.test.ts` — default identity renders world≈screen 1:1, dolly enlarges, orbit re-sorts, camera never drawn, world coords unchanged by camera

## 4. Projection pass in the render fold (NEW capability `depth-projection`)

- [ ] 4.1 Add the flatten+accumulate step: pre-order walk of visible instances → leaves with accumulated world anchor (ancestor `{x,y,z}` sum) and opacity product; containers contribute transform, paint nothing
- [ ] 4.2 Wire `project` + `depthOrder` into a `project(frame, camera, viewport) → DrawList` producing back-to-front, index-tie-broken leaves; drop culled leaves
- [ ] 4.3 Change `Renderer.make`'s fold contract from nested post-order tree to a flat ordered draw list of projected nodes (update `config.render` signature + the `Renderer.ts` service)
- [ ] 4.4 Tests: `depth-projection.test.ts` — cross-group occlusion (child of group A behind child of group B), group z offsets a subtree's order, coplanar ties fall back to tree order, culled leaves absent

## 5. Sinks consume the draw list (BREAKING)

- [ ] 5.1 `svg/SvgRenderer.ts` + `svg/SvgDomRenderer.ts`: iterate the ordered draw list; wrap each shape's existing 2D output in `translate(x y) scale(s)` and fold accumulated opacity; drop the per-top-level-layer camera transform
- [ ] 5.2 Delete `svg/camera.ts` (`layerTransform`/`depthOf`/`wrapLayer`) and the parallax path; keep the per-entity render functions in `svg/shapes.ts` unchanged
- [ ] 5.3 `sink-parity.test.ts`: both sinks emit identical draw order and per-leaf transforms

## 6. Parallax → screen-space (BREAKING) (`camera` delta)

- [ ] 6.1 Delete `shapes/Layer.ts` `depth` parallax; introduce `space: "world" | "screen"` on the top-level container (OQ3 naming)
- [ ] 6.2 `screen` subtrees flatten but skip projection (raw `{x,y}`, fixed screen layer, painted last/on top); `world` (default) projects
- [ ] 6.3 Tests: a `screen` HUD ignores the camera (identical under any camera); a `world` layer re-sorts and scales with depth

## 7. Docs & examples

- [ ] 7.1 Replace `apps/docs/examples/camera-parallax.scene.ts` with `depth-orbit.scene.ts`: depth-staggered cards, camera orbits the `target`, occlusion order visibly re-sorts mid-shot
- [ ] 7.2 Update `camera-zoom` (→ dolly), `camera-shake`, `camera-swap` to the 3D camera; update `examples/registry.ts`
- [ ] 7.3 `content/docs/`: a "2.5D & the camera" page (world z, free camera, depth-ordered paint, billboards-not-meshes, screen-space HUD); update the camera page
- [ ] 7.4 A HUD example using `space: "screen"`

## 8. Determinism, roadmap, conventions

- [ ] 8.1 AGENTS.md: record the new invariant — *paint order is camera-space depth, farthest first, ties broken by tree index (deterministic, sort-stability-independent)*; note billboards-not-meshes as a scoped non-goal
- [ ] 8.2 `roadmaps/project.md`: add the 2.5D direction + changelog entry; note `Layer.depth` removal and the camera break
- [ ] 8.3 Re-baseline `packages/export` golden frames; `pnpm test` + `pnpm check` + `pnpm lint` green across the workspace
- [ ] 8.4 Promote `Projection.ts` from experimental: export from `index.ts` if it becomes public, or keep internal with a note

## 9. Spec sync (after apply)

- [ ] 9.1 Sync `depth-projection` (new), `camera` (modified — 3D camera, parallax/Layer removed, screen-space), `traits` (modified — 3D `~position`) into `openspec/specs/`; archive this change
