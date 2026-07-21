## Context

The proposal establishes *why* the entity world closes. This document settles *how*, and the decisions below are the ones where a mechanical port would either lose a capability or reintroduce the complexity being removed.

Current state, as of this change:

- `Entity<Name, Data, Traits>` — three generic parameters, `Data extends Schema.Struct.Fields`. Threaded through `Scene.instantiate`, `Scene.data`, `Scene.update`, `Runner.instantiate`, every animator in `Motion.ts` and `Physics.ts`, and both `Instance` and `Entry`.
- Trait lenses supply per-entity position/opacity semantics. `Motion.animatePosition` reads `lens.get`, interpolates a **flat** `{x, y, z}`, writes back via `lens.set`.
- `Motion.interpolate` — the single interpolation engine — is typed `T extends Record<string, InterpolableValue>`, i.e. **flat, one level, numbers and Colors only**.
- The renderer receives `{}`-typed data and recovers via `FrameData.dataOf`, casting to `Partial<GroupData & TextData & ImageData>`, guarding every read.
- `Sync.ts` dispatches on `entry.entity.name` into a string-keyed registry; an unregistered entity throws at runtime.

The target schema (`packages/motion/src/schemas.ts`, uncommitted) is a `Schema.TaggedStruct` per entity, an `EntityMap` keyed by tag, and `Instance = { _tag, id, kind }`.

## Goals / Non-Goals

**Goals:**

- Entity identity is `_tag`; the definition set is closed and statically known.
- Remove the trait system in full, with no capability lost — every behavior a lens provided is either automatic under the transform model or expressed by `_tag` narrowing.
- Uniform `position`/`rotation`/`scale` on every entity, composing down the tree.
- Delete `FrameData.ts`; the renderer narrows on `_tag` and an unhandled entity is a compile error.
- Keep semantic animators compile-time gated: `fade(camera, …)` must not typecheck.

**Non-Goals:**

- Typed resources (`Resource.ts`, `Font.ts`, `Image.ts`) — out of scope, see the proposal. Not touched, not simplified.
- Text measurement in core. Text bounds remain renderer-side; the transform model does not attempt to fix this. Known ceiling, unchanged.
- Any change to animator timing, easing, spring simulation, or seeded randomness. Frame values must not move.
- Shear support. Removed with the Group affine, accepted.
- User-defined entities. The world closes; this is the point, not a limitation to work around later.

## Decisions

### D1: `Instance` carries a phantom tag parameter

**Decision:** `Instance<Tag extends EntityTag = EntityTag> = { readonly _tag: "Instance"; readonly id: string; readonly kind: Tag }`.

The sketch in `schemas.ts` has `kind: EntityType` — a union of all tags — making `Instance` a single type. That is one parameter short of what the animators need.

Traits provided compile-time gating: `moveTo` required `Traits extends HasPosition<Data>`, so an entity without the lens failed to typecheck. If `Instance` is untagged, `fade(camera, …)` compiles and fails at runtime (or silently writes an `opacity` field onto an entity that has none). That is a **regression**, and it removes the one thing traits were genuinely good at.

Threading the tag restores it at a fraction of the cost:

```
Instance<Name, Data, Traits>        →   Instance<Tag>
  Data: Schema.Struct.Fields              Tag: "Rect" | "Circle" | …
  (a type-level blob; source of           (a string-literal union;
   every variance fight and cast)          narrows for free)
```

Animators then gate structurally on the resolved data:

```ts
type TagsWith<K extends string> = Extract<Entity, Record<K, unknown>>["_tag"]
declare const fadeTo: <Tag extends TagsWith<"opacity">>(…) => …
```

`fade(camera)` fails at compile time, and the error names `opacity` — a real field — rather than a `~opacity` sigil.

**Alternatives considered:** (a) Flat `Instance`, runtime dispatch — rejected, loses gating. (b) `Instance<Tag>` plus a resolved-data second parameter — rejected, the data is derivable from the tag via `EntityByTag`; a second parameter is redundant state that can disagree with itself.

### D2: The animators interpolate flat leaves, not nested structs

**Decision:** `interpolate` keeps its flat `Record<string, InterpolableValue>` signature. Semantic animators flatten `Vec3` on read and rebuild on write.

This is the sharpest consequence of `transformMixin`, and easy to miss. `position` is now a nested `Vec3`, but `interpolate` is flat by construction — and it should stay that way, because flatness is what makes the frame-exact landing logic (`i === frames ⇒ value === to`) simple and auditable.

So `animatePosition` becomes:

```
read    Scene.data(instance).position   →  { x, y, z }
lerp    interpolate over flat {x,y,z}   →  unchanged engine
write   data => ({ ...data, position: value })
```

The lens does not disappear so much as **collapse into a constant path**. Every entity's position is `data.position`; there is nothing per-entity left to dispatch on, which is precisely why the trait can go. The read/write pair stays, but it is two literal expressions rather than a declared, stored, per-entity object.

**Do not** generalize `interpolate` to walk nested structures. That would be a new abstraction replacing a deleted one — the exact trade this change exists to avoid. Raw `tween` continues to address flat numeric fields; a nested field is reached by the semantic animator that owns it.

**Alternatives considered:** (a) Nested-aware `interpolate` with path traversal — rejected, reintroduces generic machinery and complicates the exact-landing guarantee. (b) Keep positions flat (`x`/`y`/`z`) and skip `Vec3` — rejected, it is flat coordinates that force `Line`'s rigid-translation workaround (see D3).

### D3: Relative coordinates replace the custom lenses

**Decision:** skeletal shapes carry their geometry **relative to** their own `position` — `Line.start`/`Line.end` and `Path`'s `M`/`L` commands alike (see D9). `Group` composes children through the same TRS transform as every other entity.

This is the load-bearing decision — it is what makes trait removal lossless rather than a capability cut. Both custom lenses in the codebase exist to compensate for absolute coordinates:

```
Line today (absolute)                    Line after (relative)
─────────────────────                    ─────────────────────
x,y,z = start   x2,y2,z2 = end           position: Vec3
both are world points                    start, end: relative to position

~position.set must shift x2/y2/z2        move() writes position.
by the delta, or translation             start/end ride along.
STRETCHES the line.                      Nothing to compensate for.

  the lens is a fix for a                  the model has no bug
  MODELING BUG                              to fix
```

`Group` is the same story one level up: its bespoke 2D affine moved the subtree because shapes carried raw `x`/`y`/`z` with no composition rule. Uniform TRS makes composition the default, so the group lens has no work left.

**Verification obligation:** the two scenarios in the `traits` spec — *"Moving a Line does not stretch it"* and *"Moving a Group moves its children"* — must be ported to `entity-transform` tests and must pass **unchanged in observable behavior**. If either needs special-casing by `_tag` in an animator, this decision is wrong and the design needs revisiting before the port continues. That is the falsifiable check on the whole trait-removal argument.

### D4: Entity definitions live in a static map; instances hold only a tag

**Decision:** `EntityMap` (tag → `Schema.TaggedStruct`) is the single source of definitions. `getEntityDefinitionByTag(tag)` resolves. `Instance` stores `kind`, never the definition.

The `Entry` class currently stores `entity` alongside `data` and calls `entity.data.make(data)` on every `setData`. With a static map, `Entry` stores `{ id, state }` where `state` is the union, and the definition is looked up by `state._tag` when construction is needed.

Consequence: `Instance.isInstanceOf` becomes a tag comparison rather than object identity (`instance.entity.name === entity.name` → `instance.kind === tag`). Cheaper and, unlike reference equality, correct across module-instance boundaries.

### D5: The renderer registry keys on the tag union; `FrameData.ts` is deleted

**Decision:** `Sync.ts`'s registry becomes `Record<EntityTag, EntityRenderer>` and dispatch narrows on `_tag`.

Today an unregistered entity throws at runtime (`Sync.ts:355`). With a closed union the registry is exhaustive by type, so a new entity that nobody taught the renderer about **fails the build**. This is a strict improvement and worth stating as a requirement rather than leaving as a side effect.

`FrameData.ts` goes away entirely: `positionOf`, `sizeOf`, `childIdsOf`, `isVisible`, `opacityOf`, `affineOf`, `backgroundColorOf`, `fontFamilyIdOf`, `imageIdOf` are all defensive readers over `{}`. Once frame data is the typed union, each is either a direct field access or a narrow-then-access.

### D6: `visible` is a plain field; the `$`/`~` sigil namespace is retired

**Decision:** `visible: boolean` (default `true`) via `visibilityMixin` on every entity.

The sigil existed because user-declared fields might collide with engine-owned ones. No user-declared fields, no collision. This also resolves a live drift: the `instance-visibility` spec requires `$visible` held *beside* entity data; the code implements `~visible` *inside* it. Neither survives — the field is ordinary data, uniformly present because the mixin puts it there.

Note this is a **frame-data breaking change** the renderer reads (`FrameData.isVisible`). It is small and easily lost in a large port; the tasks call it out explicitly.

### D7: Runner-filled camera defaults stay, but narrow properly

**Decision:** keep the camera default-filling in `Runner.instantiate`, dispatched via `props._tag === "Camera"`.

`Runner.ts:444` fills `focalLength`/`z`/`focusDistance` because only the Runner knows `comp.width`. This is **orthogonal** to the union — it exists because schema constructor defaults cannot see runtime config, and closing the world does not change that. It does get better: `Entity.isEntity(Camera.Camera, entity)` plus a cast becomes a discriminant check that narrows for free.

Same shape for the `children` normalization special-case. Both stay; both get typed.

## Risks / Trade-offs

- **A custom lens turns out to encode semantics the transform model cannot express** → D3 makes this falsifiable up front: port the two `traits` scenarios first, before touching the animators. If they cannot pass without `_tag` special-casing in `moveTo`, stop and revisit. Cheap to check, and it invalidates the design early rather than at the end of a large port.
- **Shear loss breaks an existing scene** → No migration path by design. Audit `apps/docs/examples/*.scene.ts` for `transform/matrix` usage during the port; the TRS-only model is a deliberate trade (three.js `Object3D` is TRS-native, so this maps 1:1).
- **Frame values drift silently during the port** → Determinism is the project's core invariant, and a large refactor is exactly where it erodes unnoticed. Capture frame output for a set of representative scenes **before** the port; diff after. Field renames make a naive byte-diff useless, so compare rendered/derived values, not raw frame JSON.
- **No incremental seam; the tree is broken mid-port** → Accepted. `Entity`/`Instance` are load-bearing for every consumer and a compatibility shim costs more than the port. Mitigated by task ordering (schema → core → animators → renderer → docs) so breakage moves in one direction and `pnpm check` is the progress metric.
- **The phantom-tag gating turns out to be awkward in practice** (D1) → It is one type parameter and can be dropped to the flat `Instance` at any point without touching runtime behavior, at the cost of the compile-time gate. Reversible; not a one-way door.
- **"While we're in here" scope creep** → Resources are the likeliest casualty (they look like traits). The proposal fences them explicitly; reviewers should reject resource changes in this change's diff.

## Migration Plan

Ordered so breakage propagates in one direction and each step ends checkable:

1. **Land the schema.** `schemas.ts` becomes the definition source: entity union, `EntityMap`, `EntityByTag`, `Instance`, `Entry`. Nothing consumes it yet.
2. **Port the falsifying tests first** (D3). Rewrite the rigid-Line and subtree-Group scenarios against the transform model. These gate the rest of the port.
3. **Core plumbing.** `Runner` (entry storage, tree, camera defaults, children normalization), then `Scene` (`instantiate`/`data`/`update`).
4. **Animators.** `Motion.ts` and `Physics.ts`: drop `traitOrDie`, collapse lenses to field paths (D2), retag the generics (D1).
5. **Delete traits.** `Entity.ts` trait exports, `Shape2D` lens helpers, per-entity lens declarations, `traits.test.ts`.
6. **Renderer.** `_tag` dispatch in `Sync.ts`, exhaustive registry, delete `FrameData.ts`.
7. **React + docs.** Public types, then every `apps/docs/examples/*.scene.ts`.
8. **Spec sync.** Deltas applied, `traits` capability removed, drifts in `instance-visibility` and `object-depth` resolved.

**Rollback:** the change lands on a branch; rollback is discarding it. There is no partial-deploy state to unwind — this is a library refactor with no runtime migration and no persisted data.

### D8: Animation targets only the channels the author names

**Decision:** the existing sparse-target rule is an invariant the port must preserve, extended to `position`'s individual channels. It is not re-decided here.

This resolves what looked like an ambiguity — a `Rect` carries both `scale` and explicit `width`/`height`, seemingly two ways to express size. There is no ambiguity, because animators never touch a field the author did not name. Two mechanisms already implement this, and they are the same rule at two levels:

```
field level    startValues() iterates Object.keys(target)
               → a field absent from `to` is not interpolated at all
                 (not interpolated-to-itself — simply untouched)

channel level  moveTo: { ...current, ...to }
               → a missing axis holds at its current value
```

So `to: { width: 200 }` animates width and leaves `scale` alone; `to: { scale: … }` does the converse. Neither is privileged, and the author's target is the whole specification of what moves.

**Port constraint:** nesting `position` into a `Vec3` must not break channel-level sparseness. `moveTo(rect, { x: 100 })` must continue to animate x while holding y and z — which means the semantic animator flattens, merges over current, and rebuilds (D2), rather than passing a partial `Vec3` through to `interpolate`. A partial `Vec3` reaching the engine would lerp `undefined` and produce NaN frames; `startValues` already dies loudly on this, and that guard must survive the port.

This is a **behavioral invariant with existing test coverage**, not a new capability. Any port that changes which fields move is a regression regardless of whether it typechecks.

### D9: Per-entity transform composition

**Decision, resolving the four questions the design opened:**

- **`Path` gets `position`.** Its `M`/`L` commands are relative to it, exactly as `Line`'s `start`/`end` are (D3). This makes the relative-coordinate rule universal across the skeletal shapes rather than a `Line` special case — and it means translating a Path is rigid for the same reason, with no per-entity handling.
- **`Camera` takes `position` and `rotation` only.** Not scale, not opacity, not visibility. Rotation is already part of the camera model, coexisting with `poi`; the rest are meaningless for a viewpoint. The Runner already omits the active camera from the frame's instance map — it is view state that never paints — so this is not an arbitrary carve-out but a consequence of what a camera *is*.

  This yields the cleaner split the spec states: **paintable entities** carry the full transform plus appearance (`scale`, `opacity`, `visible`); `Camera` is the single non-paintable member and carries only `position` and `rotation`. One exception, one reason.

- **`opacity` is universal across paintable entities**, defaulting to `1`, from a shared mixin. This restores uniformly what the current code already has piecemeal — every shape carries `opacity` today, via `Shape2D.filled` or an explicit spread — but which the schema sketch dropped. Grouping it with `visible` in an appearance mixin is deliberate: both are engine-owned presentation state, both apply to anything that paints, and neither should be declarable per entity.

  Consequence for D1's gating: `fade` can no longer be gated by "does this shape have opacity" — every paintable one does. The only instance it must reject is `Camera`. The gate is still real and still worth having (it is the same mechanism that rejects `move` on entities without position), but its practical surface is now exactly one member.
- **`Hud` is a distinct tag** with `Group`'s field set. Same data, different renderer treatment — the discriminant doing its job.
- **`Rect` sizing** — see D8. Not a conflict.

## Open Questions

None blocking. The four questions this design opened are resolved in D8 and D9.

### Multiple simultaneous cameras (deferred, groundwork only)

Anticipated use cases: cross-fading between two cameras, or rendering two views side by side. **No abstraction for this is built in this change**, and none should be — the two cases do not share a design (a cross-fade blends two view matrices into one output; side-by-side is two viewports and a compositing concern). Building a view/viewport abstraction covering both, before either has a concrete requirement, would recreate exactly the speculative-generality problem this change exists to remove.

What the investigation established, so the option stays cheap:

- **The renderer already composites multiple views per frame.** `Sync` maintains a world camera and a HUD identity camera over separate scenes. Multi-view rendering is not the blocker.
- **The blocker is the frame contract.** `Frame.camera` is a single `CameraState`, and the Runner picks it via one `activeCameraId`. That singularity — not the entity model, not the renderer — is what a second active camera would have to change.
- **`Camera` is already an ordinary tree node.** N cameras can coexist today; `setCamera` merely chooses which one the frame reports.

**The only groundwork this change owes is negative: do not make `Camera` structurally special.** It stays an ordinary member of the entity union, instantiated and animated like anything else, with no singleton assumption baked into the Runner beyond the existing `activeCameraId` pointer. A port that "simplified" Camera into a dedicated non-entity field would be the expensive thing to undo. D9's treatment (Camera as the single non-paintable member, still a normal union member) already satisfies this.

Record the ceiling with a `ponytail:` comment at the frame-contract seam per repo convention — the known ceiling is "one active camera per frame", and the upgrade path is a frame carrying a list of views rather than a single camera. Note there is already a related `ponytail:` marker in `Sync.ts` about precomps rendering through a comp-local camera; whoever picks up multi-camera should read both together.

Deferred, and deliberately not part of this change:

- **Text bounds in core.** `Text` still has no dimensional fields; layout stays renderer-side because the engine cannot measure text. The uniform transform composes fine without it, but anything needing text extent (centering a group on text, laying out relative to it) remains unanswerable in core. Pre-existing ceiling, unchanged by this change, worth a `ponytail:` marker if the port touches the area.
- **Whether `scale` should compose multiplicatively down the tree or be flattened at the seam.** The renderer is TRS-native so either works; the port should follow three.js `Object3D` semantics as the path of least resistance and revisit only if a scene needs otherwise.
