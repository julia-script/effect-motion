## 1. Per-particle PRNG

- [x] 1.1 Add a small seeded PRNG (a couple of numbers of state per particle) with a pure `next` step and a way to seed it from the runner's `Random` service; no `Math.random`, no wall-clock
- [x] 1.2 Unit-test determinism: same seed ⇒ same sequence; two independently-seeded PRNGs are independent (consuming one does not affect the other)

## 2. Particle buffer + config types

- [x] 2.1 Define the emitter config types: uniform `[min, max]` ranges for speed/angle/life/size, plain shared forces (gravity), and over-life curves for size/opacity (referencing `Timing.TimingInput`)
- [x] 2.2 Implement the fixed-capacity buffer: per-particle state `{ x, y, vx, vy, age, life, drawn props, rngState }`, with a reserved per-particle PRNG slot (`ponytail:` comment: reserved for Tier-3, unread by Tier-2, droppable)
- [x] 2.3 Implement overflow policy: overwrite oldest live particle when at capacity; live count never exceeds capacity
- [~] 2.4 Decide SoA vs. AoS: chose array-of-structs mutated in place, kept private behind the field's data boundary, with a `ponytail:` note pointing at SoA+typed-arrays as the upgrade path. NOTE: benchmark not yet run — deferred until a real scene exercises high capacity; the representation is swappable without touching the spec.

## 3. Per-frame step (the pure fold)

- [x] 3.1 Emit step: compute particles-to-birth-this-frame (burst = all `count` on emission frame; stream = `rate / frameRate` per frame), seed each new particle's PRNG from the runner, draw ranged props at birth in a FIXED, documented order
- [x] 3.2 Integrate step: advance position/velocity under shared forces; advance age
- [x] 3.3 Kill step: mark particles whose age ≥ life as dead and free their slots
- [x] 3.4 Over-life evaluation: compute size/opacity from age via the configured easing; deterministic, no randomness after birth
- [x] 3.5 Assert the whole step is a pure `(buffer, frame) → buffer` with no external entropy (`step`/`birth` take seeds as input; the only impure draw lives in the animator)

## 4. ParticleField entity + shape

- [x] 4.1 Define the `ParticleField` entity (schema struct for buffer + config) following the `shapes/` conventions; register in the package barrel (`Particles` in the index)
- [x] 4.2 Implement the render function: fold live particles into N SVG primitives; register with the sink like other shapes (`ponytail:` comment: SVG node count is the rendering ceiling; batched sink is the upgrade path)
- [x] 4.3 Verify the field mounts as a single tree node and its particles are not individual tree nodes (browser DOM check: 120 particles inside 2 field `<g>` nodes)

## 5. simulate animator

- [x] 5.1 Implement `simulate(duration)` mirroring `Motion.interpolate`'s loop: run the per-frame step then `Scene.tick` once per frame — one phaser arrival per frame for the whole field
- [x] 5.2 Provide dual call forms (`simulate(field, duration)` and `field.pipe(simulate(duration))`), dispatching on `Instance.isInstance`
- [x] 5.3 Pin and implement end-of-duration semantics: the field stops emitting/integrating when the animator's duration ends; the loop runs exactly `frames` iterations so the last frame is exact
- [x] 5.4 Export `simulate` and `ParticleField` from the public API surface (`Particles` namespace)

## 6. Tests (determinism + behavior)

- [x] 6.1 Same seed ⇒ byte-identical frame list for a scene containing a `ParticleField` (burst)
- [x] 6.2 Ranged props produce varied-but-in-range particles; shared forces apply uniformly
- [x] 6.3 Over-life curves depend only on age (two particles at the same age match), size shrinks 5→0 at end of life
- [x] 6.4 Burst births all on frame F; stream births ~one/frame at rate = fps; expired particles stop rendering
- [x] 6.5 One phaser party per frame regardless of live count; N frames over N frames
- [x] 6.6 Overflow overwrites oldest; live count capped at capacity

## 7. Docs

- [x] 7.1 Add a runnable example scene (confetti burst + drifting ambience) in `apps/docs/examples/particle-field.scene.ts` and register it
- [x] 7.2 Add a concept page for the particle system: distributions-not-particles model, burst vs. stream, over-life curves, determinism; describe features neutrally

## 9. Fill emission (evenly-spread floating field)

- [x] 9.1 Add `birthFill`: scatter a particle at a random point in the region, give it a random-direction `drift` velocity, mark it `wrap` + infinite life (fixed draw order documented)
- [x] 9.2 Integrate step wraps `wrap` particles around the region edges (positive-modulo) instead of aging/killing them
- [x] 9.3 Add `{ fill: n }` emission to `simulate`; default the region to the frame size (or the field's own `region`), pass `mode` into `step`
- [x] 9.4 Extend `ParticleField` schema + `EmitterConfig` with optional `region` and `drift`
- [x] 9.5 Tests: birthFill scatters within region + marks wrap/infinite; spread actually fills (not clustered); fill particles never die and wrap over 600 frames
- [x] 9.6 Docs: `floating-field` example + a "Floating fields" section on the concept page (browser-verified: 140 particles spread across the full 500×300 frame at frame 0)

## 10. Typed mode constructors + opacity randomization

- [x] 10.1 Add `Particles.emitter(props)` and `Particles.field(props)` — two typed front doors onto one `ParticleField` entity; each accepts only its mode's props; branded return types (compile-time only)
- [x] 10.2 Constrain `simulate` per brand: emitter → `{burst}|{rate}`, field → `{fill}`; a mismatch is a type error (verified with `@ts-expect-error`)
- [x] 10.3 Make `speed`/`angle`/`life` defaulted in the schema so one struct serves both modes; keep `region`/`drift` optional
- [x] 10.4 Add per-particle `opacityRange` (drawn at birth, LAST in draw order so no earlier draw shifted); render multiplies baseline × over-life opacity curve; absent range → opaque, no draw consumed
- [x] 10.5 Tests: opacity drawn within range; baseline multiplies curve; fill via the `field()` constructor spreads across the frame; type-mismatch is rejected
- [x] 10.6 Migrate all four docs example scenes to the new constructors; add `opacityRange` where it reads well; update the concept page (emitter/field split, opacity on two axes, compile-time emission check). Browser-verified: fill field renders 140 particles with 61 distinct opacity values in [0.2, 1]

## 8. Wrap-up

- [x] 8.1 `pnpm check` and `pnpm test` green (198+ core tests, all workspaces); lint scoped to changed files (repo-root `lint:fix` blocked by a pre-existing stray nested biome.json in `.claude/worktrees/`, unrelated to this change)
- [x] 8.2 Confirm no new runtime dependency and no changes to Entity/Runner/Phaser/Renderer requirements
