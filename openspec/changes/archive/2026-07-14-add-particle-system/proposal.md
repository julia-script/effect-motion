## Why

Motion graphics routinely need many small, similar, short-lived elements — confetti bursts, sparks, embers, drifting ambience — that no author wants to choreograph individually. Today the only way to produce them is to instantiate each as its own `Instance` and `fork` an animator per element. That puts one fiber and one phaser party on the frame barrier *per particle*, making the barrier O(N) with a large constant every frame; it falls over well before the particle counts these effects call for, and it forces the author to write per-element code for something whose whole point is that it is rule-driven, not choreographed.

## What Changes

- Add a **`ParticleField`** entity/shape: a single instance whose data holds a fixed-capacity buffer of particle state, advanced by one per-frame step. N particles cost **one** fiber and **one** phaser party — O(1) on the barrier — instead of N.
- Add a **`simulate(duration)`** animator that advances the field: one phaser tick per frame, emitting/integrating/killing particles as a pure fold of `(buffer, frame) → buffer`.
- Author behavior as **distributions, not per-particle code** (Tier 2): each varying property (speed, angle, life, size, …) is a uniform range sampled once per particle at birth; over-life curves (size, opacity) evolve deterministically as a function of particle age, reusing the easing vocabulary in `Timing.ts`.
- Support **both emission models**, unified as "how many particles to birth this frame": one-shot **burst** (`count` at a frame — confetti, impacts) and continuous **stream** (`rate` per second — snow, embers, ambience).
- **Determinism by construction**: the runner's seeded `Random` seeds each particle's own independent PRNG at birth; evolution after birth is pure. Same seed ⇒ byte-identical field. No `Math.random`, no wall-clock.
- **Fixed-capacity ring buffer**, overwrite-oldest when full (a `ponytail:` known ceiling; grow-on-demand deferred).
- **Tier-3 forward-compat reservation**: each particle carries its own PRNG state in the buffer from day one, even though no Tier-2 curve reads it, so a future Tier-3 `fn(age, rng)` per-property config is purely additive — no buffer layout change. Explicitly out of scope for this change.

## Capabilities

### New Capabilities
- `particle-system`: an array-backed particle emitter — a single `ParticleField` entity whose fixed-capacity buffer of seeded particles is advanced by one per-frame simulation step; Tier-2 distribution config (uniform ranges at birth, over-life curves), dual burst/stream emission, deterministic per-particle PRNG, and a `simulate` animator that ticks the phaser once per frame.

### Modified Capabilities
<!-- None. The field is a new shape and a new animator; it reuses the existing Entity/Runner/Phaser/Renderer machinery without changing their requirements. -->

## Impact

- **New code** in `packages/motion/src/`: a `ParticleField` shape (`shapes/`), its per-frame step and buffer, the `simulate` animator, and a small seeded per-particle PRNG. Registered in the package barrel and the renderer sink like other shapes.
- **Reuses, does not change**: `Entity`/`Instance` (the field is one entity), `Runner` (one instance, one tree node), `Phaser` (one party), `Renderer` (folds the buffer into N primitives at render time), `Timing.ts` (over-life easing), `Randomness` (seeds the per-particle PRNGs).
- **Docs**: a new runnable example scene (confetti + ambience) and a concept page, consistent with the docs-coverage work in flight.
- **No breaking changes**; no new runtime dependency.
