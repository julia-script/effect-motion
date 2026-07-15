## Context

effect-motion renders a tree of schema-backed instances frame by frame. The moving parts that matter here:

- **The render fold** (`Renderer.ts`) is a **post-order tree walk**: `buildEntry(id)` recurses into `children`, renders them first, and hands the rendered array to the container's render function, which *embeds* them (`<g>{children}</g>`). So the output structure mirrors the tree, and **paint order = document order = tree order**.
- **The camera** (`Camera.ts`, `svg/camera.ts`) is view state riding on `FrameMeta.camera = {x, y, zoom}`. Instance data stays in world coordinates; each *top-level layer* is wrapped in an SVG transform scaled by its `Layer.depth ∈ [0,1]` — a parallax blend, not a z coordinate. `depth: 0` = screen-fixed HUD, `depth: 1` = full camera.
- **Determinism** (AGENTS.md): duration animations land exactly, springs snap on settle, no wall-clock / `Math.random()`, failures are loud defects. Frames must be byte-reproducible.

The ceiling: there is no z. Entities cannot occlude by depth, the camera cannot leave the picture plane, and the tree — an *authoring* structure — is forced to double as *paint order*. The user's instinct is exactly right: "the tree order is not what decides what is in front of the camera."

Constraints shaping the design:

- **Pre-release, no backwards compatibility** — breaking changes are free now (roadmap v0.1 "quiet publish"). We may redefine the camera and delete `Layer` parallax.
- **2.5D, not 3D** — primitives stay flat 2D (SVG circles/rects/text). We place and sort them in 3D and scale them by distance; we do **not** render 3D meshes or true perspective-warped quads.
- **effect pin** `4.0.0-beta.94` — `Schema`/`Effect` as they exist there. Changing seeded-random sequences is a tracked cost; this change adds no randomness.
- **base/To pairs, dual call forms, all-or-nothing traits** — z must arrive through the existing lens/field machinery, adding no new animators.

## Goals / Non-Goals

**Goals:**

- A world z axis on every positioned entity, animated by the existing primitives.
- A free camera: positioned and aimed anywhere, animated as an ordinary instance.
- Paint order decided by **camera-space depth**, deterministically — the tree no longer dictates front/back.
- Flat 2D primitives unchanged; the projection is a seam the per-entity renderers never see.
- A pure, portable, sink-agnostic projection core (already landed as a POC).

**Non-Goals:**

- **Per-entity 3D rotation / true perspective-warped quads.** Cards are billboards (face the camera, scale by distance). Axis-tilted foreshortening is a follow-on (needs a 3D transform stack + quad decomposition on the SVG side). Called out in D5.
- **A z-buffer / GPU sink.** SVG has no depth buffer, so it *needs* the painter's sort. A canvas/WebGL sink that offloads sorting to a hardware z-buffer is a later capability, noted in Efficiency.
- **Frustum culling beyond behind-camera.** We cull points at/behind the eye plane; off-screen and far-plane culling are an optimization, not correctness, deferred.
- **Group-as-a-unit depth sorting.** We sort *leaves*, not subtrees (see D4). Keeping a group's overlapping children painting together (for grouped transparency) is a documented limitation.

## Decisions

### D1 — z is added to `~position`, not a separate trait

`Shape2D.position` becomes `{ x, y, z }` with `z` defaulting to `0`; `Shape2D.positionLens<Data extends {x,y,z}>()` reads/writes all three. The `~position` trait value type becomes `{x, y, z}`.

- **Why**: traits are all-or-nothing get/set lenses; z is *part of* where a thing is, not a separate concern. Folding it into `~position` means `move`/`moveTo` (and `spring`/`springTo`, which drive the same lens) animate z with **zero new animators** — honoring "ship the base/To pair, never a lone form" without writing one. Raw `tween("z", …)` also works because z is an ordinary numeric field.
- **Compatibility**: partial-origin fills already read the current value, so `moveTo({ x: 400 })` leaves z untouched; a z-less scene stays on the `z: 0` plane and renders identically.
- **Alternatives**: (a) a separate `~depth` trait — rejected, splits an atomic concept and forces authors to animate position and depth separately; (b) leave z off shapes and only let *groups* carry z — rejected, you could not place a single card in space without wrapping it.

### D2 — The camera is a free 3D camera with a reference-plane perspective

`Camera` fields become `position: {x,y,z}`, `target: {x,y,z}`, `up: {x,y,z}` (default +Y), `projection: "perspective" | "orthographic"`. `FrameMeta.camera` carries the same. The projection model (implemented in `Projection.ts`):

- Build an orthonormal **view basis** once per frame: `forward = normalize(target − position)`, `right = normalize(cross(up, forward))`, `up' = cross(forward, right)`. Right-handed so world +X → screen +X and world +Y → screen up.
- A world point's **camera-space depth** is `dot(point − position, forward)` — its distance along the view direction. Larger = farther.
- **Reference-plane perspective**: the eye→target distance `d0 = |target − position|` defines the plane that renders at *authored* size. Billboard `scale = d0 / depth` (perspective) or `1` (orthographic). A card at the target plane keeps its size; nearer cards grow, farther cards shrink and drift toward the vanishing point (screen center). Screen anchor: `(w/2 + viewX·scale, h/2 − viewY·scale)`.
- **Culling**: `depth ≤ ε` (at/behind the eye) → not drawn.

- **Why reference-plane, not an explicit focal length / FOV**: it makes the camera *author-friendly with the animators we already have*. Dollying (`moveTo` the camera's `position` toward `target`) enlarges the subject; orbiting (`moveTo` the position around a fixed `target`) re-sorts depth — both fall out of animating ordinary fields. A raw FOV knob would be a second, redundant control. (An explicit `fov` can be added later without breaking this; `d0` is its implied focal length.)
- **Why keep the camera an `Instance`**: the whole reason the current camera is animatable for free (`cam.pipe(moveTo(...))`, `spring`, `fork`) — unchanged. `target` and `position` are both `~position`-like `{x,y,z}` fields; a *second* trait can't be `~position` twice, so `target` is animated via raw `tween`/`tweenTo` on `targetX/Y/Z`, or we expose a small `Camera.lookAt` helper. (Open question OQ1.)
- **Alternatives**: Euler yaw/pitch/roll instead of look-at — rejected as primary; look-at ("orbit the logo, look at it") is the motion-graphics idiom and composes with `moveTo` on a target. Euler can layer on later as an alternate constructor.

### D3 — A projection pass sits between the world-space frame and the sink

New pure stage: `project(frame, camera, viewport) → DrawList`, where `DrawList = ReadonlyArray<{ id, entity, data, transform: {x,y,scale}, opacity }>` in **paint order** (back-to-front). It:

1. **Flattens** the visible tree pre-order into leaves (containers paint nothing), accumulating down each ancestor path: the world anchor (sum of ancestor `{x,y,z}` offsets + the leaf's own) and the opacity product.
2. **Projects** each leaf's world anchor through the camera (D2) to a screen anchor + billboard scale + camera-space depth; drops culled leaves.
3. **Orders** by depth, farthest first, with an explicit original-index tiebreak (`depthOrder` in `Projection.ts`).

The sink then emits leaves in order, wrapping each shape's *existing* 2D output in `translate(x y) scale(s)` and folding accumulated opacity in. The per-entity render functions in `svg/shapes.ts` are untouched.

- **Why a separate pass, not sink-side projection like today**: depth sorting needs a *flattened, transformed* view of the whole tree at once — it is intrinsically global, and it fights the post-order embed model (a container can't embed children that must paint interleaved with another container's children). Computing it once, engine-side, keeps every sink a dumb 2D painter and guarantees all sinks agree on order (sink-parity). Instance data still never mutates — projection is purely downstream/view, so determinism and `moveTo` land-exactly semantics are untouched (the same property today's camera relies on).
- **Consequence — group transform/opacity must be *baked* into leaves.** Today a group's `<g transform>`/`<g opacity>` nests around children. Flattening removes the nesting, so the pass must accumulate them onto each leaf. For the POC/first cut we bake **translation (x/y/z) and opacity**; a group's 2D affine `transform` (rotation/scale) is applied in *screen space* after projection (post-multiplied onto the leaf transform) — correct for billboards, and the honest scope for 2.5D. Full 3D group transforms (D5) generalize this to a matrix stack.
- **Alternatives**: (a) keep the tree and sort siblings only — rejected, does not solve cross-group occlusion (the actual bug); (b) sort in each sink — rejected, duplicates the pass and risks sink divergence.

### D4 — Sort leaves, with a deterministic index tiebreak

The draw list is leaves, ordered by `dot(anchor − eye, forward)` descending, ties broken by original flatten index (pre-order = tree order). `depthOrder` builds `{item, index, depth}` and sorts on `depth desc, index asc` explicitly, so it does not depend on `Array.prototype.sort` stability.

- **Why leaves, not subtrees**: sorting groups as units reintroduces "group order ≠ depth order" — a group spanning a depth range would paint entirely in front of or behind things it interleaves with. Per-leaf is correct.
- **Why the explicit tiebreak — this is a determinism invariant**: coplanar entities (same depth, e.g. two things on the `z: 0` plane) must resolve to a *stable, reproducible* order or frames aren't byte-identical across runs/platforms. Falling back to tree index means **coplanar paint order = authoring order** — the intuitive, backwards-compatible behavior (a flat scene paints in tree order, exactly as today).
- **New invariant to record in AGENTS.md**: *paint order is camera-space depth, farthest first, ties broken by tree index — deterministic and independent of sort-algorithm stability.*

### D5 — Billboards now; a 3D transform stack later

Cards face the camera and scale by distance. Per-entity 3D orientation (tilt a card away from the camera, with foreshortening) is **out of scope**: SVG cannot express a true perspective quad without decomposing the shape, and it needs a real 3D transform per node. The forward path is a matrix stack: `Group.transform` generalizes from a 2D affine (6 numbers) to a 3D transform (translation + rotation), the flatten accumulates 4×4s, and the projection warps quads. Billboards are the right first cut — they read as genuine 2.5D (parallax + size falloff + occlusion) and keep every shape renderer unchanged.

### D6 — Parallax is subsumed; HUD becomes explicit screen-space

`Layer.depth ∈ [0,1]` is deleted: real z under perspective makes far things lag the camera for free (a distant plane moves less on screen as the eye pans), which *is* parallax. The one irreducible use of `depth: 0` — a HUD pinned to the viewport, ignoring the camera — is reframed as `space: "screen"` on a top-level container: its subtree is flattened but **not projected** (rendered at raw `{x, y}`, always on top / in a fixed screen layer). `space: "world"` (default) is projected. This is a cleaner boolean ("is this in the world or on the glass") than a continuous blend, and it is the honest distinction that survives real depth.

## Efficiency (the user's explicit question)

**Cost is one stable sort per frame, `O(n log n)` on visible leaves** — for motion-graphics scenes (tens to low-thousands of entities) this is negligible next to per-frame SVG serialization. Flatten + accumulate is `O(n)`. Concretely, how we keep it cheap and how it scales:

- **Hoist per-frame setup**: the view basis is computed once (`viewBasis`), not per point. Projection per leaf is a handful of dot products.
- **Deterministic sort without a comparator-stability dependency**: `depthOrder` keys on `(depth, index)` explicitly — correct *and* branch-predictable.
- **`ponytail` — temporal coherence**: frame-to-frame, depth order barely changes. Keeping the previous frame's order and **insertion-sorting** is ~`O(n)` on a nearly-sorted list. Worth swapping in only if a large scene makes the full sort show up in a profile — noted in `Projection.ts`.
- **Coarse bucketing** for very large n: partition into z-slabs, sort within slabs — turns the constant down when exact ordering within a slab doesn't matter visually.
- **Dirty-tracking the flatten**: recompute accumulated anchors only for moved subtrees (most entities are static per frame) — a future optimization; the frame is recomputed wholesale today anyway.
- **The real escape hatch is the sink model**: SVG has no z-buffer, so it *must* painter-sort. A canvas/WebGL sink writes depth to a hardware z-buffer and skips the CPU sort for *opaque* geometry entirely (transparent still needs back-to-front). So "efficient depth" is partly "match the sink to the workload" — the projection pass produces the depth either way; only whether we sort on the CPU differs.

## Risks / Trade-offs

- **Grouped transparency**: baking group opacity onto leaves and sorting leaves independently means a semi-transparent group whose children interleave in depth with outside content can composite differently than a nested `<g opacity>` would. Acceptable for 2.5D; documented. (A group that needs to composite as a unit is the future "render-to-layer then place" case.)
- **Camera `target` animation ergonomics** (OQ1): a second `{x,y,z}` can't also be the `~position` trait. Until resolved, `target` animates via raw `tweenTo("targetX", …)` — usable but less pretty than `moveTo`. A `Camera.lookAt(instance)` (target follows another instance's position, evaluated per frame) may be the nicer answer and dovetails with the roadmap's lazy/reactive-instances direction.
- **Golden-frame churn**: every camera/depth example re-baselines. Expected and cheap pre-release.
- **Ortho vs perspective default**: perspective is the 2.5D-selling default; a scene wanting the old flat look sets `projection: "orthographic"` and gets pan/zoom-equivalent behavior via camera position + a fixed scale.

## Migration Plan

Additive-first, already begun: `Projection.ts` + `projection.test.ts` land the pure core with zero engine impact (done). Then, in one breaking pass: z on `~position` → 3D camera fields → the projection pass in `Renderer.ts` → sinks consume the draw list → delete `Layer` parallax / add `space` → re-baseline goldens and rewrite the camera examples. Each step keeps `pnpm test`/`pnpm check` green; the sink switch and the camera-field switch are the two irreversible commits, sequenced last.

## Open Questions

- **OQ1** — Best authoring surface for aiming the camera: raw `tween` on `targetX/Y/Z`, a `Camera.lookAt(point | instance)` helper, or an Euler alternate. Leaning `lookAt(instance)` (reads well, composes with orbits, aligns with lazy instances).
- **OQ2** — Should `z` participate in `spring`/`move` easing as one vector (ease the 3D distance) or per-axis (current lens behavior)? Per-axis is what the lens gives for free; vector easing is a possible `move3d` follow-on.
- **OQ3** — Keep `Layer` as the name for the `space` container, or introduce `Shapes.Screen` / a `space` field on `Group`? Naming only; behavior is D6.
