## Why

The entity system was designed for an **open world**: users would define custom entities, and multiple render targets (SVG, canvas, Lottie) would each bring target-specific ones. That premise is gone. The library settled on 2.5D with three.js as the single renderer, which covers every case the multi-renderer plan was hedging against. The entity set is now closed and known at compile time.

The machinery built for the open world is still here, and it costs on every axis:

- **`Entity<Name, Data, Traits>`** — three generic parameters, one of them a `Schema.Struct.Fields` blob, threaded through `Motion`, `Physics`, `Scene`, `Runner`, every shape, and the renderer. Variance fights and casts at each seam.
- **Traits** (`~position`, `~opacity`, `traitOrDie`) — a lens layer whose job was to normalize access across entities whose shapes were unknowable, and to fail loudly at runtime when an entity lacked a trait.
- **`{}` at the renderer seam** — because an entity's fields are "only known to the entity that declared them", frame data types as `{}`. `packages/renderer/src/FrameData.ts` exists solely to recover from this, and does so by reconstructing `Partial<GroupData & TextData & ImageData>` — a hand-rolled discriminated union with the discriminant discarded.

Meanwhile `packages/renderer/src/Sync.ts` already dispatches on `entry.entity.name` into a registry. **The renderer is doing tag dispatch today**; it just carries a whole entity object to obtain one string. This change does not introduce a discriminated union — it admits the one already in use.

Two independent simplifications land together and cancel the same machinery:

1. **Closing the world** replaces open-ended generics with `Schema.TaggedUnion` and `_tag` narrowing.
2. **A hierarchical transform model** (`position`/`rotation`/`scale` on every entity) removes the reason custom trait lenses existed at all. `Line`'s lens shifts `x2/y2/z2` by hand so translation does not stretch the line — a workaround for endpoints being absolute world points. With endpoints relative to the entity's own `position`, moving the line is free. `Group`'s lens moves its subtree via a bespoke 2D affine — unnecessary once every entity composes transforms uniformly.

Traits are not being replaced by the union. **They are being made unnecessary by the transform model, while the union makes their type-level gatekeeping redundant.**

### What is NOT changing: typed resources

The typed-resource system (`Resource.ts`, `Font.ts`, `Image.ts`) is untouched, and the distinction matters because it superficially resembles traits and is not the same thing:

| | Traits | Typed resources |
|---|---|---|
| Question asked | "does this entity have a position field?" | "was this asset actually provided?" |
| Answered by | inspecting the entity's declared shape | Effect's `R` channel (`ImageLoader<"logo">` sits in requirements until a layer supplies it) |
| Under a closed world | **static — the question dissolves** | **unchanged — still open** |

The set of *entities* is now closed. The set of *assets a scene loads* is open forever, because `Image("logo")` is authored per scene, not per library. No amount of closing the entity world makes that answerable statically.

The two systems are also mechanically independent today: resources never touched traits. An entity stores only an `{ _tag, id }` reference (`Image.schema`, `Font.schema`) as ordinary field data; the obligation to have loaded the bytes lives in the *scene's* requirements type. That separation is what keeps frames pure of resource bytes — a deliberate invariant, since the engine cannot measure text.

**Resources belong to scenes, not entities.** This change SHALL preserve that boundary intact: `LoaderBrand`, `ExtractLoaders`/`ExcludeLoaders`, the per-id `Context.Service` loaders, and the phantom-requirement authoring pattern all survive verbatim. The union's `Image` and `Text` members continue to carry resource references as plain schema fields.

## What Changes

- **BREAKING** — `Entity` becomes a closed `Schema.TaggedUnion` over the ten known entities (`Line`, `Path`, `Rect`, `Circle`, `Ellipse`, `Text`, `Group`, `Hud`, `Image`, `Camera`). The `Entity<Name, Data, Traits>` interface, `Entity.make`, `AnyEntity`, `EntityData`, and `isEntity` are removed. Entity identity is `_tag`.
- **BREAKING** — the trait system is removed entirely: `TraitLens`, `EntityTraits`, `PartialTraits`, `TraitKey`, `traitOrDie`, `~position`, `~opacity`, the `positionLens`/`opacityLens` helpers, and every per-entity lens declaration. Semantic animators (`move`, `moveTo`, `fade`, `fadeTo`, `spring`, `springTo`) target schema fields directly and are gated by `_tag` narrowing.
- **BREAKING** — every entity carries a uniform transform: `position: Vec3`, `rotation: Vec3`, `scale: Vec3`. `Rect`'s `rotX`/`rotY`/`rotZ` and the flat `x`/`y`/`z` fields are subsumed. `Line`'s `start`/`end` become `Vec3` **relative to** its `position`; `x2`/`y2`/`z2` are removed.
- **BREAKING** — `Group`'s 2D affine is removed: `TransformMatrix`, `TransformOperation`, the transform-operation DSL, `identityTransform`, and `multiplyTransforms`. Group composition uses the same TRS transform as every other entity. Shear is no longer expressible — an accepted loss (three.js `Object3D` is TRS-native, so this maps 1:1 to the renderer).
- **BREAKING** — `Instance` no longer carries its entity. It becomes `{ id, kind }`, where `kind` is the entity's `_tag`; entity definitions are resolved from a static map. The type keeps a single phantom tag parameter (`Instance<Tag>`) so animators stay compile-time gated. `isInstanceOf` compares tags rather than object identity.
- **BREAKING** — engine-owned visibility is a plain `visible: boolean` field on every entity, replacing `~visible`. This also resolves a live spec/code drift: `instance-visibility` specifies `$visible` held *beside* the data; the code implements `~visible` *inside* it. The closed world removes the field-collision risk that motivated the sigil.
- `Hud` remains a distinct tag. Its data is identical to `Group`; the distinction exists because renderers treat it differently, which is exactly what a discriminant is for.
- Frame data at the renderer seam becomes the typed entity union. `packages/renderer/src/FrameData.ts` — the `dataOf` cast and its per-field guards — is deleted; readers narrow on `_tag`.
- The `~transform3d` trait required by the `object-depth` spec is dropped. It was never implemented (a second live drift); the uniform transform supersedes it.

## Capabilities

### New Capabilities

- `entity-model`: the closed tagged union of entity definitions — the entity set, `_tag` as identity, the static definition map, and the rule that no new entity may be defined outside the library.
- `entity-transform`: the uniform transform every entity carries (`position`/`rotation`/`scale` as `Vec3`), its composition semantics down the tree, and the relative-coordinate rule that makes rigid translation automatic.

### Modified Capabilities

- `traits`: removed in full — every requirement in this capability is deleted, and the semantics its scenarios protect (a moved Line stays rigid; a moved Group carries its subtree) migrate to `entity-transform` as behavioral requirements.
- `shapes`: shape definitions become union members rather than `Entity.make` calls; the "portable styling props" requirement is restated against the transform model, and its renderer-agnostic framing is corrected — three.js is the single target.
- `instance-visibility`: `$visible`/`~visible` beside-the-data becomes a plain `visible` field on every entity; the reserved-`$`-namespace requirement is removed with the open world.
- `object-depth`: the `~transform3d` trait requirement is replaced by `entity-transform`; per-object z and Euler orientation are retained as behavior.
- `tweening`: raw field tweening is unchanged; the `Spring combinators` requirement is restated to drop the `~position` lens vocabulary in favour of the `position` field. No other requirement in this capability is affected.

**Explicitly unaffected:** `instance-children` requires no delta. Its requirement never references traits or entity generics, and D4 preserves its behavior exactly — children remain an `Array<string>` of ids, and the polymorphic input is unchanged. Listed here because a change of this breadth invites speculative edits to adjacent specs.

## Impact

**Core (`packages/motion`)** — `Entity.ts` and `Instance.ts` are rewritten (or removed, folding into a schema module); `Runner.ts` loses its generic entry plumbing and the `Entity.isEntity` camera special-case; `Motion.ts` and `Physics.ts` lose `traitOrDie` and their three-parameter signatures; every file under `shapes/` becomes a union member; `Camera.ts`, `Scene.ts`, and `Projection.ts` follow the type changes.

**Renderer (`packages/renderer`)** — `FrameData.ts` is deleted. `Sync.ts` dispatches on `_tag` instead of `entity.name`, and its registry keys become the tag union, making an unregistered entity a compile error rather than a runtime throw.

**React (`packages/react`)** and **docs (`apps/docs`)** — follow through the public types; every example in `apps/docs/examples/*.scene.ts` is touched by the transform-model change.

**Tests** — `packages/motion/test/traits.test.ts` is deleted; its rigid-Line and subtree-Group scenarios are rewritten as transform tests.

**No seam exists for an incremental landing.** `Entity` and `Instance` are load-bearing for every consumer, and a compatibility shim would cost more than the port. This lands as one change, broken-then-fixed, with ordered tasks.

**Out of scope — do not touch during the port.** `Resource.ts`, `Font.ts`, and `Image.ts` are unchanged. They resemble traits (both are type-level gates) but answer a question the closed world does not settle; see "What is NOT changing" above. Any simplification of the loader/requirements machinery is a separate change.

**Determinism is unaffected.** No animator timing, easing, spring simulation, or seeded-random behavior changes. Frame *values* for existing scenes should be identical modulo the field renames; scenes that relied on `Group` shear are the one exception and have no migration path.
