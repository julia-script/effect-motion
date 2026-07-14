# Tasks: animatable camera + per-layer parallax

## 1. Camera entity + runner state
- [x] 1.1 Define a `Camera` entity: `~position` trait over `{x, y}` plus a `zoom` field (`Shape2D.defaultedNumber(1)`). Not registered with any sink renderer. (Lens inlined, not `positionLens()` — the generic helper needs a second trait present to infer the data type; see Line.ts precedent.)
- [x] 1.2 Hold an active camera on the `Runner`, defaulting to an identity camera (`{x:0, y:0, zoom:1}`) instantiated at runner start so `depth`/zoom work with no author ceremony.
- [x] 1.3 Scene selects the camera via `Scene.camera` (the default instance to animate) + `Scene.setCamera(instance)` to swap the active camera.
- [x] 1.4 Read the active camera's current data into `runner.state` so it flows onto the frame. **Also: exclude the active camera id from the frame's `instances` map** — it lives in the internal store so animators drive it, but it is view state, not a renderable instance (surfaced separately as `state.camera`).

## 2. Camera on the frame + metadata
- [x] 2.1 Add `camera: { x, y, zoom }` to `Frame` and to `FrameMeta` (Renderer.ts).
- [x] 2.2 Populate `camera` in `runner.state`; default `{0,0,1}` when the camera is identity. World instance data is untouched by the camera.

## 3. Layer entity carries depth (was: Group depth)
- [x] 3.1 ~~Add optional `depth` field to `Group`~~ — superseded: `depth` on Group couples parallax to a container that will grow transforms and offers nowhere to restrict layers. Replaced by a dedicated entity.
- [x] 3.3 Added `Layer` entity (`shapes/Layer`): `children` + `depth` (default 1), no position/opacity. Renders as a plain `<g>` container (registered in `svg/shapes.ts` for both sinks), draws nothing itself.
- [x] 3.4 Removed `depth` from `Group`; restored Group to its pre-change fields.
- [x] 3.5 `ponytail:` note on `Layer` marks nested Layers as undefined behavior (no guard yet); notes where the guard would go.
- [x] 3.6 Exported `Layer` from the shapes barrel (re-exported via `Shapes`).
- [x] 3.7 Tests: parallax now uses `Shapes.Layer`; added "bare shape feels full camera" and "top-level Group has no depth / feels full camera". Example + docs migrated to `Layer`.

## 4. SVG sink transform (shared helper)
- [x] 4.1 `layerTransform(camera, depth, width, height)` helper in `svg/camera.ts`: `layerZoom = 1 + (zoom-1)*depth`, `pan = camera.{x,y}*depth`, transform `translate(cx,cy) scale(layerZoom) translate(-cx,-cy) translate(-panX,-panY)` with `cx,cy = width/2, height/2`. Returns "" when identity. Plus `depthOf` (Groups carry depth; others = 1) and `wrapLayer`.
- [x] 4.2 `SvgRenderer` (string sink): wraps each top-level layer via `wrapLayer` + the helper.
- [x] 4.3 `SvgDomRenderer`: same wrapping in the DOM path.
- [x] 4.4 Non-Group top-level instances render with `depth` defaulting to 1 (via `depthOf`).

## 5. Tests (determinism + parallax math) — `test/camera.test.ts`
- [x] 5.1 Identity camera adds no transform (guards "existing scenes unaffected"); all 21 pre-existing test files still pass unchanged.
- [x] 5.2 Camera animation lands frame-exact: `moveTo` on x/y and `tweenTo` on zoom hit target on the final frame.
- [x] 5.3 Parallax: `depth: 0.3` layer pans by 30 when camera pans 100; full-depth layer pans 100; `depth: 0` layer adds no transform (HUD).
- [x] 5.4 Zoom scales about viewport center (`translate(250 150) scale(2) translate(-250 -150)` at 500×300).
- [x] 5.5 World data unchanged: `data.x` stable across every frame while the camera pans to 300.

## 6. Docs + example
- [x] 6.1 `apps/docs/examples/camera-parallax.scene.ts`: far/mid/near parallax layers + a `depth: 0` HUD, camera pans right and back. Registered in `examples/registry.ts`.
- [x] 6.2 `apps/docs/content/docs/concepts/camera.mdx`: the camera instance, animating it with the primitives, the `depth` table (incl. `depth: 0` = HUD), and `Scene.setCamera`. Added to concepts `meta.json`.
- [x] 6.3 Updated `Shape2D.ts` comment: camera pan/zoom is a sink-level view transform; per-shape rotation still future.

## 7. Verify
- [x] 7.1 `pnpm build` (4/4), `pnpm test` (197 core + 24 react), `pnpm check` (6/6) all green. Lint introduces zero new errors (8 pre-existing on main, 8 after; my files clean but for the repo's baseline `any`/non-null warnings in tests). Parallax verified live in the docs preview: HUD (depth 0) stays fixed, near circles track the camera fully, mid squares at half, far stars barely — layers separate by exactly their depth ratios as the camera pans.
- [x] 7.2 `openspec validate add-camera-parallax --strict` passes.
