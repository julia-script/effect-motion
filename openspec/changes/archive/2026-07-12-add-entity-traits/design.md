# Design: Add Entity Traits

## Context

Entities are schema-backed definitions (`Entity.make(name, data)`); instances carry their entity; Motion's animators interpolate raw numeric props via a shared eased engine. After simplify-animation-api the public animators are `tween`/`tweenTo` (+ `spring`/`springTo`), and the `move*` names are free. An in-progress sketch on `Entity.ts` (set-only trait functions, `Traits` generic) is the seed this change reshapes into lenses.

## Goals / Non-Goals

**Goals:**
- Semantic helpers that work across every entity implementing a trait, with per-entity semantics.
- Type-level detection: helper on an untraited entity = compile error; runtime defect as backstop.
- Traits are pure data transforms in definition files — renderer-agnostic, respecting the shapes/target layering.
- All-or-nothing pairs: get and set defined together or not at all.

**Non-Goals:**
- Color traits/interpolation (`~fill`, `~stroke`) — needs a color module (parse, interpolate, format, `"none"` story); own change.
- `~scale` — no shape stores a scale, so a lawful lens has no `get`; revisit with either a stored scale field or relative-scaling semantics.
- Raw-prop physics — dropped with the reshape (D6); elastic/bounce easings on `tweenTo` cover springy arbitrary props.
- User-defined trait *kinds* beyond the built-in keys — the record is extensible later; ship the known keys first.

## Decisions

### D1: Traits are lenses, all-or-nothing
```ts
interface TraitLens<Data, Value> {
  readonly get: (data: Data) => Value;
  readonly set: (data: Data, value: Value) => Data;
}
type EntityTraits<Data> = {
  "~position": TraitLens<Data, { x: number; y: number }>;
  "~opacity": TraitLens<Data, number>;
};
```
`set` keeps the whole-data-in / immutable-whole-data-out shape (each entity owns its semantics); `get` exists because "To" helpers need an origin to tween from. The pair is one object per key, so partial implementation is unrepresentable — `Partial` applies only at the traits-record level (omit a trait entirely, never half of one). Key names drop the set/get verbs (`~position`, not `~setPosition`).

### D2: Declaration at `Entity.make`, typed through `Instance`
`Entity<Name, Data, Traits extends Partial<EntityTraits<Data["Type"]>> = {}>`; `make(name, data, traits?)` infers `Traits` from the argument (defaults aligned between interface and make — the mismatch in the current sketch is what produced the `EntityTraits<unknown>` errors). `Instance<Name, Data, Traits>` threads the traits so helper constraints see them: `moveTo` requires `Traits extends { "~position": TraitLens<..., {x, y}> }`. `AnyEntity` stays `Entity<any, any, any>`.

### D3: Helper engine — get once, animate, set per frame
Every helper follows one recipe: read the origin via the lens's `get` (base forms take an explicit origin instead, with get filling partial origins), animate the extracted value with an engine, apply each frame via `Scene.update(instance, data => set(data, value))`. Two engines, same recipe: the eased tween engine (move/fade families) and the spring simulation (spring family). Partial position targets hold the missing axis at its current value. All helpers are dual/pipeable via the established `isInstance` predicate, land exactly on target, and resolve with the instance.

This is also the type simplification: helpers take the lens's concrete value types (`{x?, y?}`, `number`) — the `Target<Data>`/`InterpolableOnly` conditional types remain only inside the raw `tween`/`tweenTo` layer.

### D4: Built-in implementations live in the definition files
Each `shapes/*.ts` declares its lenses beside its schema — pure data transforms, no renderer imports, layering intact. Semantics per shape: Circle/Rect/Square/Ellipse/Path map `~position` to `x`/`y`; **Line translates `x`,`y`,`x2`,`y2` together** (the motivating fix — get returns the start point, set translates by the delta); Group's `~position` is its transform (moving a group moves the subtree). `~opacity` maps to the `opacity` field everywhere it exists; Line included.

### D5: Detection — compile-time first, defect backstop
Typed consumers can't call `moveTo` on an entity without `~position` (constraint on the threaded `Traits`). At runtime the helper resolves the trait from `instance.entity.traits` and dies with a defect naming the entity and trait key if absent — same loud-failure convention as the renderer's traversal defects.

### D6: Physics joins the trait layer; raw-prop physics dropped
`Physics.spring(instance, from, to, springInput?, settleTolerance?)` and `springTo(instance, to, ...)` animate the `~position` lens through the existing spring simulation (per-key position/velocity on x/y, unchanged physics). Both prior forms — callback `spring` and raw-prop `springTo` — are removed. Consequence accepted: arbitrary fields can no longer be sprung with true physics (the playground's radius plop migrates to an elastic-eased tween); if that's ever genuinely missed, a raw physics pair can return under a distinct name without disturbing this layer.

### D7: Scene failure propagation (discovered during implementation)
The missing-trait defect test exposed a latent bug: a scene fiber that *dies* never set the running scene's `done` flag (success-path only), so `Scene.stream` spun forever on empty phases and failures were unobservable. Fixed as part of this change: `done` is set via `ensuring` (success, failure, interrupt alike), and `Scene.step`, on a finished scene, awaits the fiber's exit and propagates a failure cause instead of ending the stream silently.

## Risks / Trade-offs

- [Traits generic ripples through Entity/Instance signatures across the codebase] → Defaults (`= {}`) keep untraited call sites compiling; the ripple is type-level only.
- [Two ways to move things (`tweenTo({x})` vs `moveTo({x})`)] → Deliberate layering: tween = mechanism on raw props, move/fade/spring = meaning via the entity's own semantics. Docs state the rule of thumb: prefer the semantic helper when one exists.
- [Radius-plop-style effects lose true physics] → Elastic/bounce easings approximate them well at demo scale; recorded escape hatch in D6.
- [Trait `set` runs every frame (allocation per frame)] → Same cost profile as existing updaters (`Object.assign` per frame); no new overhead class.
- [Partial targets on `~position` need merge semantics] → Defined in D3: get supplies missing axes; documented.

## Open Questions

- None blocking. `~scale`'s origin story and color interpolation are the recorded follow-ups.
