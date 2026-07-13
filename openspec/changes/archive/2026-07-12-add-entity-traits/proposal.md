# Add Entity Traits

## Why

Prop-level tweening can't express *meaning*: `tweenTo(line, { x: 100 }, ...)` stretches a Line (x/y is only its start point), and every consumer must know each entity's field names. Traits let entities declare semantic capabilities — "I can be positioned", "I can be faded" — as data lenses, so helpers work across *any* entity implementing the trait, with per-entity semantics (Line's position trait translates both endpoints) and type-level detection. Making **every semantic helper** trait-based (duration-based and physics-based alike) also collapses the type machinery: helpers take concrete lens value types (`{x?, y?}`, `number`) instead of `Target<Data>`-style conditional types, which stay confined to the raw `tween`/`tweenTo` layer.

## What Changes

- **Entities gain traits**: `Entity.make(name, data, traits?)` accepts a partial record of trait lenses. Each trait is **all-or-nothing**: a lens `{ get: (data) => Value; set: (data, value) => Data }` — `set` takes the whole data and returns a new immutable whole (each entity owns its semantics); the pair is a single object, so a getter without a setter (or vice versa) is unrepresentable.
- **First trait wave (numeric only)**: `~position` (`{x, y}`) and `~opacity` (number). `~scale` and color traits (`~fill`, `~stroke`) are deferred — scale has no lawful `get` until shapes store one, and colors need interpolation machinery that deserves its own change.
- **Built-in shapes implement the traits**, including the motivating fix: Line's `~position` translates all four coordinates (start *and* end), so moving a Line moves it instead of stretching it. Group's traits make helpers work on whole subtrees.
- **`Instance` carries the entity's traits in its type**, so helpers constrain on trait presence; runtime backs the types with a defect naming the entity and trait when absent.
- **The complete semantic helper set, all trait-based, all in base/To pairs** (base = explicit origin, To = origin via the lens's get):
  - `Motion.move(instance, from, to, duration, timing?)` / `Motion.moveTo(instance, to, duration, timing?)` — `~position`, eased.
  - `Motion.fade(instance, from, to, duration, timing?)` / `Motion.fadeTo(instance, to, duration, timing?)` — `~opacity`, eased.
  - **BREAKING**: `Physics.spring(instance, from, to, springInput?, settleTolerance?)` / `Physics.springTo(instance, to, springInput?, settleTolerance?)` — `~position`, spring physics. Replaces both prior forms (the callback `spring` and the raw-prop `springTo`).
- **Accepted trade — raw-prop physics is gone**: springing arbitrary fields (e.g. the playground's radius plop) now uses elastic/bounce *easings* on `tweenTo`, or position springs. True physics on arbitrary props can return later if genuinely missed.
- Depends on `simplify-animation-api` (which frees the `move*` names).

## Capabilities

### New Capabilities

- `traits`: The lens-shaped trait system — declaration on entities, all-or-nothing pairs, built-in shape implementations, type + runtime detection, and the trait-based helper set (move/fade/spring families).

### Modified Capabilities

- `tweening`: "Spring combinators" rewritten — spring/springTo become position-trait helpers rather than raw-prop animators.

## Impact

- `src/Entity.ts` (traits generic + make; replaces the in-progress sketch with the lens shape), `src/Instance.ts` (Traits threading), `src/Motion.ts` (move/moveTo/fade/fadeTo), `src/Physics.ts` (spring/springTo reshaped; Target/startValues imports dropped), every `src/shapes/*.ts` (trait implementations).
- New `test/traits.test.ts`; physics tests updated; playground gains a Line move and migrates the radius plop to an elastic-eased tween.
- New `AGENTS.md` documenting the API conventions (base/To pairs, raw-vs-semantic layers, dual forms, trait lens shape).
- No dependency changes.
