---
"effect-motion": minor
"@effect-motion/renderer": minor
---

The entity world is closed: a tagged union and a uniform transform replace open generics and traits.

**BREAKING (pre-1.0 minor):** `Entity` is now a closed `Schema.TaggedUnion` over the ten known entities (`Line`, `Path`, `Rect`, `Circle`, `Ellipse`, `Text`, `Group`, `Hud`, `Image`, `Camera`); entity identity is `_tag`. The open-world machinery is removed: `Entity<Name, Data, Traits>`, `Entity.make`, `AnyEntity`, `EntityData`, `isEntity`, and the entire trait system (`TraitLens`, `EntityTraits`, `PartialTraits`, `TraitKey`, `traitOrDie`, `~position`, `~opacity`, `positionLens`/`opacityLens`, every per-entity lens). Semantic animators (`move`/`moveTo`, `fade`/`fadeTo`, `spring`/`springTo`) target schema fields directly and are compile-time gated by `_tag` narrowing — fading an entity without `opacity` is a type error naming the missing field.

Every entity carries a uniform transform: `position: Vec3`, `rotation: Vec3`, `scale: Vec3`. Flat `x`/`y`/`z` fields and `Rect`'s `rotX`/`rotY`/`rotZ` are subsumed; `Line`'s `start`/`end` become `Vec3` offsets **relative to** its `position` (`x2`/`y2`/`z2` removed), so animating `position` translates any shape rigidly with no per-entity compensation. `Group`'s unused 2D affine DSL (`TransformMatrix`, `TransformOperation`, `identityTransform`, `multiplyTransforms`) is deleted; groups compose the same TRS transform as everything else.

`Instance` no longer carries its entity: it is `{ id, kind }` with a phantom `Instance<Tag>` parameter, and `isInstanceOf` compares tags. Engine-owned visibility is a plain `visible: boolean` field (replacing `~visible`). At the renderer seam, frame data is the typed union itself — `FrameData.ts` and its casts are deleted; the renderer narrows on `_tag` through an exhaustive registry.
