# Tasks

## 1. Projection module (pure math, no renderer changes)

- [x] 1.1 Add `Projection.ts`: Vec3/Mat4 helpers (compose, multiply, invert) for the view+perspective cases only
- [x] 1.2 `viewMatrix(camera)` and perspective params from position + Euler rotation + focalLength + viewport
- [x] 1.3 `project(viewProj, p)` → `{ x, y, depth, w }`; `billboardMatrix(camera, anchor)` → affine placement
- [x] 1.4 `projectQuad(camera, corners)` → four screen-space corners
- [x] 1.5 Unit tests: identity camera maps z=0 to plain-2D coords; determinism (same input → bit-identical); nearer = larger scale; receding tilt = trapezoid (far edge shorter)

## 2. Camera model

- [x] 2.1 Extend `Camera.ts` fields: `z`, `rotX/rotY/rotZ`, `focalLength` with identity-preserving defaults
- [x] 2.2 Widen `FrameMeta.camera` to `{ x, y, z, rotX, rotY, rotZ, focalLength }` and wire through `Scene`/`Runner`
- [x] 2.3 Test: existing animators (`moveTo`, `tween`, `spring`) drive the new fields; camera still never drawn

## 3. Render pipeline: flatten → project → sort → paint (billboards first)

- [x] 3.1 Rewrite `Renderer.render` to flatten the tree to a draw list with composed world transforms (Group = coordinate composition, no paint-order boundary)
- [x] 3.2 Attach view-space depth per entry; stable sort far→near, tie-break on id
- [x] 3.3 Change `RenderFunction` payload to carry the projected screen transform; leaf renderers consume projected coords instead of raw x/y
- [x] 3.4 Update both sinks (`SvgRenderer`, `SvgDomRenderer`) to consume the sorted draw list instead of the tree
- [x] 3.5 Test: deeper object paints behind nearer regardless of tree order; grouped children interleave with ungrouped by depth; sort deterministic on ties; identity-camera output byte-identical to before for z=0 scenes

## 4. Object depth + billboard projection end-to-end

- [x] 4.1 Extend `~position` to 3D: `Shape2D.position` gains `z` (default 0); `positionLens` becomes a 3D lens; add `rotX/rotY/rotZ` raw fields to shapes
- [x] 4.2 `move`/`moveTo` accept `z`; wire billboard projection through shape render fns (anchor → affine matrix)
- [x] 4.3 Test: animating `z` foreshortens position and size; billboard circle stays a circle

## 5. Tilted planes

- [x] 5.1 Solid-fill tilt (Rect): emit `<polygon>` from four projected corners — exact in BOTH sinks; add Euler `orientation` to Rect
- [x] 5.2 ~~DOM text/nested CSS-3D tilt~~ — deferred; tilt scoped to rectangular solid planes for the POC (spec: "Only rectangular solid planes tilt")
- [x] 5.3 ~~String text/nested affine fallback~~ — deferred with 5.2; non-Rect shapes stay billboards even when rotated
- [x] 5.4 Test: receding tilted Rect is a trapezoid; un-tilted Rect stays a `<rect>`; both sinks agree on polygon points

## 6. Remove parallax (HUD deferred to a follow-up)

- [x] 6.1 Delete `shapes/Layer.ts`, its `shapes/index.ts` export, and `svg/camera.ts` (zoom-about-center + depth parallax)
- [x] 6.2 ~~HUD marking~~ — deferred; POC does not build screen-space content (design: Resolved Decisions)

## 7. Demo + docs

- [x] 7.1 Demo scene: ~20 objects at varied z, camera dollies through and orbits; a tilted floor plane; a HUD title
- [x] 7.2 Register demo in the docs examples registry; rewrite parallax/camera-zoom docs to the 3D-camera model
- [x] 7.3 `pnpm test`, `pnpm check`, `pnpm lint` green; verify demo renders in both sinks (string export + live DOM preview)
