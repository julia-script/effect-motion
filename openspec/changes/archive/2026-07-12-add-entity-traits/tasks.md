# Tasks: Add Entity Traits

## 1. Trait foundation

- [x] 1.1 Entity.ts: `TraitLens<Data, Value>` (get + set, one object), `EntityTraits<Data>` with `~position`/`~opacity` keys, `Entity<Name, Data, Traits = {}>`, `make(name, data, traits?)` with inference and aligned defaults — reshapes the in-progress set-only sketch (design D1/D2)
- [x] 1.2 Instance.ts: thread `Traits` through `Instance` and `make`; keep `isInstance`/Pipeable intact (design D2)
- [x] 1.3 Fix ripples: `AnyEntity`, Renderer/Scene/Runner generic references compile with the new parameter

## 2. Shape implementations

- [x] 2.1 `~position` + `~opacity` lenses on Circle, Rect, Square, Ellipse, Path (x/y mapping) in their definition files (design D4)
- [x] 2.2 Line: `~position` translating x, y, x2, y2 together (get = start point); `~opacity` (design D4)
- [x] 2.3 Group: `~position` (transform) + `~opacity` (design D4)

## 3. Helper families

- [x] 3.1 Shared trait-helper engine: resolve lens (runtime defect naming entity + trait when absent), origin via get with explicit/partial-origin filling, per-frame set application (design D3/D5)
- [x] 3.2 `Motion.move`/`Motion.moveTo` (~position, eased) and `Motion.fade`/`Motion.fadeTo` (~opacity, eased) — trait-constrained duals, partial-target axis holding (design D3)
- [x] 3.3 `Physics.spring`/`Physics.springTo` reshaped onto ~position through the existing spring simulation; delete the callback spring and raw-prop springTo; drop Motion's Target/startValues imports from Physics (design D6)

## 4. Tests

- [x] 4.1 test/traits.test.ts — lens laws on built-ins: set returns new immutable data; get(set(d, v)) = v for position and opacity
- [x] 4.2 The Line fix: moveTo translates both endpoints (length/direction preserved); Group moveTo moves the subtree in rendered output
- [x] 4.3 Helpers: move/moveTo partial targets and explicit origins; fade/fadeTo exact endings; both dual forms; eased pacing respected; missing-trait defect names entity and key (via an untraited test entity)
- [x] 4.4 Physics: spring/springTo through the lens (Line springs without stretching); settle-exactness preserved; update existing physics tests to the new shapes

## 5. Docs

- [x] 5.1 Create AGENTS.md documenting the library's API conventions for agents and contributors: the base/To pair pattern (`verb(instance, from, to, ...)` = explicit origin, `verbTo(instance, to, ...)` = origin read from the instance — every animator in both Motion and Physics follows it), the two-layer rule (raw `tween`/`tweenTo` on field names vs semantic trait helpers via lenses; prefer the semantic helper when one exists), dual/pipeable call forms, and the all-or-nothing trait lens shape for adding new traits/helpers

## 6. Demo and verify

- [x] 6.1 Playground: Line moving via `moveTo` (the stretch-fix, visible); migrate the radius plop to an elastic-eased `tweenTo`; group fade
- [x] 6.2 `pnpm check`, `pnpm lint`, `pnpm test` green; browser verification
