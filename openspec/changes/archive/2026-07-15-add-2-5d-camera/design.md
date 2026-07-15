## Context

effect-motion currently models depth as parallax. `Layer.depth ∈ [0,1]` is the fraction of the camera's pan/zoom a top-level layer feels; the camera (`Camera.ts`) is pan (x/y) + uniform zoom about the viewport center (`svg/camera.ts`). Crucially, **render order is tree order**: `Renderer.render` walks the instance tree post-order from `root.children` and paints each top-level entry in sequence (`svg/SvgRenderer.ts` concatenates them). There is no z-coordinate and no per-object depth sort.

The target is the After Effects 2.5D model: every object has an `(x,y,z)` position and an orientation, and is a single flat plane (a quad) living in 3D space — never a mesh. A free camera (position + orientation + focal length) projects them through a real perspective projection. Render order for projected objects is depth-to-camera, not tree order. This is the richest of the sketched routes (real view+perspective matrices, tilt-able planes) but bounded: one plane per object keeps it tractable in SVG.

Existing foundations that help:
- The camera is already an animatable `Instance`, so extending its fields means every animator (`moveTo`, `spring`, `fork`) drives the 3D camera for free.
- Shapes already emit an affine `matrix(a b c d e f)`; a projected billboard is just a computed affine matrix.
- The sink abstraction (`FrameMeta.camera`, per-entity render functions, `SvgNode` contract) is the right seam to change.

Constraints: determinism is non-negotiable (no wall-clock, no `Math.random()`; seeded `Random` only). Two sinks must stay in lockstep: `SvgRenderer` (self-contained SVG string — the video-export path) and `SvgDomRenderer` (live DOM). The `effect@4.0.0-beta.94` pin stays.

## Goals / Non-Goals

**Goals:**
- A 3D camera that orbits / dollies / flies, driven by existing animators, deterministic.
- Per-object continuous `z` and 3D orientation; billboards by default, tilt-able planes opt-in.
- Render order determined by view-space depth (far→near painter's order), not tree order.
- z-driven scale (perspective foreshortening of position/size) and optional depth fog.
- Perspective-correct tilted **solid-fill** planes in **both** sinks (exact).
- A demo scene proving free camera + depth sort + tilt across both sinks.

**Non-Goals:**
- Meshes, arbitrary 3D geometry, or more than one plane per object.
- Perspective-correct tilt of **text / nested-content** planes in the SVG-**string** sink (affine parallelogram fallback there; exact in DOM). Named limitation, not a goal.
- Lights, shadows, real depth-of-field blur, material system (AE "extras" tier). Fog is a cheap opacity/scale ramp, not physically-based.
- Backwards compatibility with `Layer` / parallax / camera-zoom. They are removed.
- Intersecting-plane resolution (the painter's-algorithm cyclic-overlap problem). Single quads that mutually intersect will sort by a single depth key and may show incorrect overlap — documented, not solved.

## Decisions

### D1 — Camera model: position + orientation + focal length, as an Instance

The camera keeps being an ordinary `Entity`/`Instance`. Fields: `x, y, z` (world position), orientation as **Euler `rotX, rotY, rotZ`** (default 0), and `focalLength` (drives FOV; default a sensible ~50mm-equivalent for the viewport). Each frame the sink reads these off `FrameMeta.camera` and builds:
- a **view matrix** `V` = inverse of the camera's world transform (rotate then translate),
- a **perspective projection** parameterized by `focalLength` and viewport size.

**Why Euler over look-at-target for the POC:** Euler angles compose directly with the existing numeric-field animators (`tween("rotY", …)`, `spring`) with zero new machinery, and they match AE's `X/Y/Z Rotation`. A look-at target is friendlier to author but needs a derived-orientation step that isn't an animatable field. Decision: ship Euler; a `lookAt` **authoring helper** that sets rotations can come later without a model change.

**Why focal length over an explicit FOV angle:** matches AE's camera vocabulary and makes "zoom" and "dolly" distinct (zoom = change focal length, dolly = move z), which is exactly the distinction the old single `zoom` scalar couldn't express.

`FrameMeta.camera` widens from `{x,y,z:… }`… — specifically `{ x, y, z, rotX, rotY, rotZ, focalLength }`. Identity camera (`z` at a default back-off, zero rotation, default focal length) must project world-plane `z=0` objects to the same screen coordinates they'd occupy in pure 2D, so simple scenes look unchanged and stay easy to reason about.

### D2 — The projection module (`Projection.ts`), pure and sink-agnostic

A new module of pure functions, no Effect required (plain math), shared by both sinks and unit-testable in isolation:
- `viewMatrix(camera): Mat4` and `project(viewProj, p: Vec3): { x, y, depth, w }` — returns screen x/y (after perspective divide), the **view-space depth** used as the sort key, and `w` for scale.
- `billboardMatrix(camera, anchor: Vec3): { screenX, screenY, scale }` → the affine `matrix()` for a camera-facing shape.
- `projectQuad(camera, corners: [Vec3,Vec3,Vec3,Vec3]): [Vec2,Vec2,Vec2,Vec2]` → the four screen-space corners of a tilted plane.

**Why a matrix stack we own rather than leaning on CSS/SVG transforms:** the string sink has no perspective divide, so we must do the divide ourselves to support the video-export path at all. Owning the math also keeps determinism trivially inspectable (it's arithmetic on scene numbers). Cost: ~a 4×4 matrix lib's worth of code, but small and boring.

`ponytail:` the matrix ops are hand-written for the 4×4 / Vec3 cases we use — no general linear-algebra dependency. Add one only if the math surface grows beyond view+perspective+compose.

### D3 — Render pipeline: flatten → project → sort → paint (the core change)

`Renderer.render` currently returns per-top-level-layer entries painted in tree order. New pipeline:

1. **Flatten** the tree to a draw list. Walk from `root`, composing each object's world transform down the tree (a `Group`'s transform/position multiplies into its children). Output: one draw entry per *leaf paintable* (and per container that paints, e.g. a tilted group), each carrying its resolved world anchor.
2. **Project** each entry's anchor → view-space depth.
3. **Sort** the draw list stable, far→near, tie-broken by instance id for determinism.
4. **Paint** in sorted order.

**Why `Group` stops being a paint-order boundary:** in AE, 3D layers depth-sort *globally*; a group doesn't isolate its children's depth. Making `Group` pure coordinate composition is both AE-correct and *simpler* than today (no per-subtree render nesting for order). A `Group`'s job shrinks to: contribute its transform to children's world coordinates. It still exists for authoring convenience and shared animation (`~position` moves the subtree).

**RenderFunction contract change:** depth must be known *before* paint, so it can't be computed inside each leaf's render fn (which today only knows how to emit its own `<circle>`/`<rect>`). Two-phase split:
- a **project phase** (in the renderer/flatten, using `Projection.ts`) that computes each entry's world anchor + depth + the screen transform to apply,
- a **paint phase** where the entity render fn emits its primitive given the *already-projected* transform (billboard: an affine matrix; tilt: the 4 corners).

Concretely, `RenderFunction`'s payload gains the projected screen transform (and, for tilt-capable shapes, the projected corners); the leaf renderer no longer reads raw `x/y` to place itself — it consumes projected coordinates. This is the largest single edit and the riskiest; it is isolated to `Renderer.ts` + the sink render fns.

**Efficiency:** a full O(n log n) stable sort every frame. For motion-graphics scene sizes (tens–low hundreds of objects) this is negligible; the sort is not the bottleneck, the projection matmuls are, and both are linear-ish per frame. `ponytail:` naive per-frame sort — swap for a spatial structure (BSP / bucketed depth) only if a scene with thousands of objects proves it matters. Note: sorting **breaks the streaming assumption** that a frame renders in one tree walk — the flatten+sort is an extra pass per frame, but still O(n log n) per frame and fully compatible with `Scene.stream` (each frame is independent; no cross-frame state).

### D4 — Tilted-plane rendering, tiered by content

A perspective-projected flat quad maps a source rectangle to an arbitrary screen quadrilateral — a **projective (homography)** transform, which SVG's affine `matrix()` cannot express (affine gives parallelograms, not trapezoids). Resolution is tiered by what fills the plane:

- **Solid-fill plane (Rect/Square/most shapes): EXACT in both sinks.** Project the 4 corners → emit a `<polygon points="P0 P1 P2 P3">` with the shape's fill. Perspective-correct because we projected the actual corners; one node, no subdivision. This is the dominant case in motion graphics and it is *exact everywhere*.
- **Gradient / stroke:** same 4-corner polygon; gradients defined in the quad's own space are ~exact.
- **Text / nested child tree:** genuinely hard — a `<g>`/`<text>` accepts only an affine matrix, so a perspective-tilted text plane can't be exact in a string.
  - **DOM sink:** wrap in a host element with `transform: perspective(f) rotate3d(...)` — the browser does the real perspective divide. **Exact.**
  - **String sink:** **affine parallelogram fallback** (project 3 corners, fit an affine matrix; no foreshortening across the plane). Documented limitation; billboarded text is always exact.

**Why not subdivide-into-triangles for the string sink's text case:** that's textured-quad rasterization — real work, and YAGNI for a POC. The polygon-exact solid case covers most tilt needs; text-tilt-in-string is the one honest gap, flagged rather than hand-waved.

**Billboards (default, no rotation): exact in both sinks, cheap.** Project the anchor → screen xy + uniform scale → emit the existing primitive with a plain affine `matrix()`. A circle stays a circle. This is the common case and it costs almost nothing.

### D5 — HUD / screen-fixed content replaces `depth: 0`

Screen-pinned content (titles, watermarks) was a `depth: 0` layer. Replacement: a small non-projected pass — instances explicitly marked screen-space are painted after the sorted 3D pass, in tree order, untouched by the camera. Keeps the projected path clean (no "is this depth 0?" special-case inside projection).

## Risks / Trade-offs

- **RenderFunction contract change ripples to every shape renderer** → Isolate the projection in `Renderer.ts`/`Projection.ts`; give leaf renderers a single new "projected transform" input and keep their primitive emission otherwise unchanged. Land billboards first (smallest contract change), tilt second.
- **String-sink text tilt is not perspective-correct** → Named limitation in the spec + a `ponytail:` marker; billboarded text and solid-fill tilt are exact, which covers the demo and most real use.
- **Painter's algorithm can't resolve intersecting / cyclically-overlapping planes** → Out of scope (non-goal); documented. Single depth key per plane. Splitting planes at intersections is a mesh-renderer concern we deliberately don't take on.
- **Sort determinism** → Stable sort with an explicit id tie-break; unit-tested so equal-depth objects always paint in the same order across runs and across sinks.
- **Identity-camera regression** → A test pins that a default camera projects `z=0` objects to their plain-2D screen positions, so existing-style scenes render unchanged.
- **Two sinks drift** → Both consume the *same* `Projection.ts` output; only the tilt-text case differs, and that difference is asserted explicitly in tests.

## Migration Plan

No runtime users to migrate (pre-release, no compat concern). Steps:
1. Add `Projection.ts` with unit tests (pure math, no renderer changes yet).
2. Extend `Camera` fields + `FrameMeta.camera`; keep old behavior working with an identity default.
3. Rewrite `Renderer.render` to flatten+sort; land **billboards** end-to-end in both sinks (delete `svg/camera.ts` zoom path here).
4. Add object `z` + `~transform3d`; wire billboard projection through shape renderers.
5. Add tilt: solid-fill polygon path (both sinks) + DOM CSS-3D text path + string affine fallback.
6. Remove `Layer` (`shapes/Layer.ts`, export, docs); add HUD/screen-space pass.
7. Demo scene + docs registry entry; rewrite parallax docs.

Rollback: the change is a branch; revert is dropping it. No data migration.

## Resolved Decisions (from apply)

- **`z` lives on `~position` — position becomes 3D.** Greenfield: treat existing code as reusable parts, not constraints. `~position` carries `{x, y, z}` (z default 0); `Shape2D.position` gains `z`; every `positionLens` becomes a 3D lens. `move`/`moveTo` accept a `z`. Orientation (`rotX/rotY/rotZ`) rides alongside as raw numeric fields animated via `tween`.
- **HUD is out of scope for the POC.** No screen-space marking, no non-projected pass. Land the 3D camera + depth sort + tilt; HUD is a clean follow-up. (`depth-render-order`'s "screen-fixed content" requirement is deferred — see tasks.)
- **Orientation authoring:** Euler-only. `lookAt` helper deferred (additive later).
- **Fog:** left to authors to animate per-object; a minimal ramp appears only in the demo, not as a core feature.
