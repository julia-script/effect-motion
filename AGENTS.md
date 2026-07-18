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

## Two-tier 3D positioning (planar vs skeletal)

Shapes occupy 3D space in one of two ways — never both on one shape:

- **Planar** (Rect, Image, Text — content on a flat extent): anchor
  `x/y/z` plus Euler orientation `rotX/rotY/rotZ`; the renderer projects
  the plane's corners (the AE layer model).
- **Skeletal** (Line, Path): every defining point is an independent
  world point, each projected with its own depth — Line as `x/y/z` +
  `x2/y2/z2`, Path as a `points` array of `{x, y, z?}` vertices local to
  its `x/y/z` anchor (omitted `z` renders as 0). Skeletal shapes never
  get orientation fields — a segment is parametrized by its endpoints,
  and tweening a point moves it in a straight line (deriving an
  orientation instead would make tweens sweep arcs).
- The trait layer hides the split: `~position` moves ANY entity rigidly
  as one unit. Only raw field vocabulary differs per tier.

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

## The engine renders, it does not parse

Push preprocessing to **userland**. The engine's job is to render a tree
of instances frame by frame; turning source material (markdown, rich
text, data files) into that tree is the author's job, done **before** the
scene runs — not inside it.

- Prefer a plain function that returns instances (or an
  instance-producing structure) over an in-engine representation. Rich
  text is a userland builder that emits `Group`/`Text` instances, not a
  schema the engine special-cases.
- This lets authors use familiar tools — `memoize(mdToComponents(md))`
  parses once, outside `Scene.make`, and never re-runs.
- It matters for playback: frames may be computed as they play, so
  parsing inside the scene body can drop frames. Keep the per-frame path
  to rendering only.

New feature that needs to *transform* content? Default to a userland
helper. Only put it in the engine if it genuinely needs runtime state
(the seeded `Random`, the phaser, per-frame instance data).

## One structure: the instance tree

There is a single tree — instances, structured by `Group.children`
(stored as an `Array<string>` of ids). Do not introduce a second
representation of structure inside an entity's data.

- **Children-defined.** `instantiate(entity, { children: [...] })` takes a
  polymorphic list — `string` (→ a `Text`), an `Instance`, or an
  `Effect<Instance>` (a not-yet-yielded `instantiate`, yielded internally
  so a future JSX layer needs no `yield*`). Stored `children` stays ids.
- **Born mounted, then moved.** An instance is born under the ambient
  parent (root, or a `Scene.play` mount). To place a lazily-created node
  elsewhere use `Scene.appendChild(parent, child)` / `removeChild` — HTML
  DOM semantics; append detaches from the current parent first (O(1) via
  tracked parent). There is no per-callsite `parent` argument.
- **Builtin instance props are `$`-namespaced.** They live *beside* entity
  data, not in the schema, so every entity has them uniformly. `$visible`
  (default `true`) is the first; renderers skip `$visible: false`.
  `Entity.make` rejects any schema field starting with `$`.
