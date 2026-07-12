# Design: Add Group Hierarchy

## Context

Frames are flat (`{ instances: Record<id, {data, entity}> }`); the generic renderer (src/Renderer.ts) iterates `Object.entries(frame.instances)` and hands a flat iterable to each sink's `config.render`. The render *output* side is already recursive — `SvgNode` has `children`, and both SVG sinks materialize subtrees — so hierarchy work concentrates in the Runner's frame shape and the generic renderer's traversal, with sinks untouched.

## Goals / Non-Goals

**Goals:**
- Grouped transforms: move/fade a group, children follow, coordinates stay local.
- Every instance attached exactly once at birth; old flat scenes keep working unchanged.
- Hierarchy manipulable as plain data (reparent, reorder) with no new mutation API.
- Sinks unchanged; targets compose transforms natively.

**Non-Goals:**
- Helper combinators for building structures (`Scene.group([a, b])`, attach/detach ops) — later, as sugar over the data.
- Absolute-position computation in library code — targets own transform composition.
- Group styling beyond `opacity` (no group-level fill/stroke inheritance).
- Rotation/scale on groups — same future-camera/transform territory as everywhere else.

## Decisions

### D1: Hierarchy as data, guarded at traversal
`Group = { ...position, opacity, children: Schema.Array(Schema.String) }` — child ids as ordinary schema data. Reparenting and z-reordering are just `Scene.update` on the group (paint order = children array order — explicit and animatable, an upgrade over record insertion order). The soft invariants are enforced loudly at traversal time with a visited set: an id referenced twice (two parents, or a cycle) and a referenced id absent from `instances` are defects naming the offending id — in the manual-management model these are always scene bugs. Rejected: hierarchy as Runner-internal structure with attach/detach ops — safer invariants, but new API surface, and children stop being animatable data.

### D2: Explicit root group, id `"root"` by convention
The Runner creates one Group instance at startup with the fixed id `"root"`; `state` returns `{ instances, root: "root" }`. The root never renders: the frame renderer emits the root's children as the top-level entries passed to `config.render` — the same iterable shape sinks receive today, no wrapper element in output. The root's data exists like any group's (future camera = transform the root), but at identity it is invisible.

### D3: Birth attachment via `instantiate`, cleanup via `destroy`
`Scene.instantiate(entity, props, { parent? })` — parent is a Group instance, default the root; the Runner appends the new id to the parent's `children`. This is what prevents both orphans (everything is reachable) and double-render (an id is born into exactly one parent; only deliberate manual edits can violate it, and D1's defects catch that). `destroy` scans all group instances and strips the id from any `children` array — O(instances), always correct even after manual reparenting, no parent-pointer bookkeeping to go stale. Rejected: a Runner-maintained parent map (desyncs when users reparent through plain data updates).

### D4: Post-order traversal in the generic renderer; `children` in the render payload
`RenderFunction` payload becomes `{ entity, id, data, children }` where `children: ReadonlyArray<RenderEntitySuccess>` is the rendered output of the instance's children (empty for leaves and non-containers; leaf renderers simply ignore it). The frame renderer walks the tree from the root post-order — children render before parents, parents receive results. Group's SVG renderer is then one node: `{ tag: "g", props: { transform, opacity }, children }`. How does the generic renderer know an instance HAS children? It doesn't need entity-type knowledge: any instance whose data has a `children` array of ids participates as a container (duck-typed at traversal; Group is the only built-in shape with one). BREAKING for the `RenderFunction` type; behavior-compatible for all existing renderers.

### D5: Local coordinates, target-composed
A child's `x`/`y` is relative to its containing group. SVG composes via nested `<g transform="translate(x y)">` — the library never computes absolute positions; group `opacity` likewise composites at the target level. Top-level semantics are unchanged (root at origin ⇒ top-level coordinates are viewport coordinates), so no existing scene observably changes until it nests something. The svg-rendering spec's "Absolute positioning" requirement is updated to say local-to-parent. This is the second tenant of the camera seam: a camera later is plausibly a root-group transform, nearly free once this lands.

### D6: Group renders as `<g>` even when empty
No special-casing empty groups or identity transforms beyond prop omission rules already in the manifest helper (translate omitted at 0/0, opacity omitted at 1) — an empty `<g />` in output is harmless and keeps the renderer simple.

## Risks / Trade-offs

- [Manual reparenting can produce duplicates/dangling refs] → Traversal defects with the offending id (D1); `destroy`'s full scan keeps the common path clean (D3).
- [Duck-typing containers on a `children` array could false-positive a user entity with an unrelated `children` field] → Documented reserved meaning: in frame data, `children: string[]` means child instance ids. Acceptable pre-1.0; an explicit container marker on the Entity is the escape hatch if it ever bites.
- [Frame shape break ripples through tests/consumers] → All consumers are in-repo; the shape change is mechanical (`instances` access unchanged, `root` added).
- [O(instances) destroy scan] → Trivial at animation scales; revisit only if scenes reach thousands of instances with heavy churn.

## Open Questions

- None blocking. Helper combinators (`Scene.group`, attach/detach) deliberately deferred.
