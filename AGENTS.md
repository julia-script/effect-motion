# effect-motion — API conventions

Conventions for agents and contributors working on this codebase. The
library animates schema-backed entities in deterministic, frame-exact
scenes built on Effect. These rules hold everywhere; PRs that break them
need a design reason recorded in an openspec change.

## The base/To pair pattern

Every animator comes as a pair distinguished **only** by where the
origin comes from:

- `verb(instance, from, to, ...)` — **explicit origin**. Partial origins
  are filled from the current value.
- `verbTo(instance, to, ...)` — **origin read from the instance** (via
  its data or trait lens).

This holds across both engines: `tween`/`tweenTo` and `move`/`moveTo`,
`fade`/`fadeTo` (duration + easing) as well as `spring`/`springTo`
(physics, no duration — length emerges from the simulation). When adding
a new animator, ship the pair, never a lone form.

## The two layers

| layer | functions | operates on | value types |
|---|---|---|---|
| **raw** | `Motion.tween` / `tweenTo` | numeric fields by name | `Target<Data>` (inferred from the schema) |
| **semantic** | `Motion.move`/`moveTo`, `Motion.fade`/`fadeTo`, `Physics.spring`/`springTo` | trait lenses | concrete (`{x?, y?}`, `number`) |

Rule of thumb: **prefer the semantic helper when one exists** — it
carries per-entity meaning (moving a Line translates both endpoints;
moving a Group carries its subtree). Use `tween`/`tweenTo` for fields
without a trait (`radius`, `width`, custom entity fields). Springy
effects on raw fields use elastic/bounce *easings*, not physics.

## Trait lenses (all-or-nothing)

A trait is a complete get/set lens declared on the entity:

```ts
Entity.make("shapes/Thing", fields, {
  "~position": {
    get: (data) => ({ x: data.x, y: data.y }),
    set: (data, value) => ({ ...data, x: value.x, y: value.y }),
  },
})
```

- `get` and `set` live in **one object per trait key** — a lone getter
  or setter is unrepresentable by design. Entities may omit a trait
  entirely, never half of one.
- `set` receives the whole data and returns a **new immutable whole**;
  each entity owns its semantics.
- Current keys: `~position` (`{x, y}`), `~opacity` (number). Standard
  x/y implementations come from `Shape2D.positionLens()` /
  `Shape2D.opacityLens()`; write a custom lens only when semantics
  differ (see `shapes/Line.ts`).
- Detection is type-level (helpers constrain on the instance's traits;
  calling `moveTo` on an untraited entity fails compilation) with a
  runtime defect naming the entity and trait key as backstop.

## Call forms

Every animator is a dual: data-first `verb(instance, ...)` or pipeable
`instance.pipe(verb(...))`. Dispatch is by `Instance.isInstance` on the
first argument (never arity — trailing optional params make arity
ambiguous). Animators resolve with the instance, so they chain.

## Determinism invariants (do not break)

- Duration-based animations land the final frame **exactly** on target;
  springs snap exactly on settle.
- Scenes are pure functions of `(scene, settings)` — no wall-clock, no
  `Math.random()` (seeded `Random` is provided to every scene).
- Failures are loud: missing traits, invalid springs, unknown timing
  names, and scene-graph violations die with defects naming the
  offender.
