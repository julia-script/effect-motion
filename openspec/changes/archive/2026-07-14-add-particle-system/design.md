## Context

effect-motion has no unit cheaper than an `Instance`. An Instance is schema-backed, lives as its own node in the entity tree, carries trait lenses, and — the load-bearing cost — is animated by a **fiber** that waits on the `Phaser` frame barrier once per tick. That is the right unit for authored elements. It is the wrong unit for particles.

A particle effect (confetti, sparks, embers, drifting ambience) wants hundreds to thousands of small, similar, short-lived elements that the author never addresses individually. Building them as Instances puts one fiber and one phaser party on the barrier *per particle*: every frame the phaser must observe N arrivals before it advances, and `Scene.update` allocates a fresh schema-made data record per particle per frame. Both are O(N) with a large constant. It falls over well before the counts these effects need, and it forces the author to write per-element code for something that is inherently rule-driven.

The insight this design turns on: **a particle is not an Instance — it is numbers evolving by a rule.** It needs no individual addressing, no trait lens, no tree node, no fiber. So the field, not the particle, is the Instance. One `ParticleField` instance holds a flat buffer of particle state and is advanced by a single per-frame step. N particles cost one fiber and one phaser party.

Constraints inherited from AGENTS.md and CLAUDE.md (non-negotiable):
- **Determinism**: same seed ⇒ byte-identical output; no `Math.random`, no wall-clock; the seeded `Random` service is the only entropy source.
- **base/To + dual + `Instance.isInstance` dispatch** for every animator.
- Failures are **loud defects** naming the offender.
- Shapes register per-shape render functions folded by a sink (`Renderer.ts`).

## Goals / Non-Goals

**Goals:**
- A `ParticleField` entity/shape whose data holds a **fixed-capacity buffer** of particle state, advanced by one pure per-frame step — O(1) on the phaser barrier regardless of particle count.
- **Tier-2 authoring**: every varying property is a uniform range sampled once per particle at birth; a small set of **over-life curves** (size, opacity) evolve deterministically as a function of particle age, reusing `Timing.ts` easings.
- **Dual emission**, unified as "particles to birth this frame": one-shot **burst** and continuous **stream**.
- **Determinism by construction**: the runner's seeded `Random` seeds each particle's own independent PRNG at birth; all evolution after birth is pure.
- A **`simulate(duration)`** animator that ticks the phaser exactly once per frame.
- **Tier-3 forward-compat**: reserve a per-particle PRNG slot in the buffer now so a future `fn(age, rng)` config is purely additive.

**Non-Goals:**
- **Tier-3 arbitrary per-property closures** — reserved for, not built by, this change (see Decisions).
- **Particle interaction** — no collision, attraction, flocking, spatial hashing. Every particle is independent.
- **GPU / WebGL rendering.** Particles render as ordinary SVG primitives folded by the existing sink. (`ponytail:` ceiling; a batched/instanced sink is the upgrade path if SVG node count becomes the wall.)
- **Growable buffers.** Capacity is fixed at instantiate; overflow overwrites oldest.
- Reusing the existing `tween`/`spring` animators *per particle* — they are fiber-and-phaser-bound by construction, which is exactly the cost being avoided.

## Decisions

### 1. The field is the Instance; particles are packed buffer state

One `ParticleField` entity, one Instance, one tree node, one fiber, one phaser party. Its data carries a fixed-capacity buffer of per-particle state plus emitter config. The per-frame step is a pure fold `(buffer, frame) → buffer`: emit new particles, integrate live ones, kill expired ones. The renderer folds the live particles into N SVG primitives at render time.

- *Why:* collapses the barrier cost from O(N) fibers to O(1), and turns the O(N) per-particle work into a plain tight loop — the struct-of-arrays a game engine uses, minus the per-object overhead.
- *Alternative — pool of reusable Instances:* the game-dev reflex. Rejected: pooling solves realtime allocation churn and GObject construction cost, neither of which is our bottleneck. Our bottleneck is fibers-on-the-barrier, which pooling does nothing for; each pooled Instance still needs a fiber to move. It would fight the architecture, not help it.

**Open sub-decision (buffer layout):** struct-of-arrays (`Float64Array` per field: `x[]`, `y[]`, `vx[]`, …) vs. array-of-small-structs (`Array<{x,y,…}>`). SoA is faster and allocation-flat; AoS is simpler and plays nicer with the schema/`Scene.update` immutability convention. Leaning SoA behind the field's data boundary (the field's *data* stays a single value the Runner owns; the buffer's internal representation is the field's private business). Resolve during implementation with a micro-benchmark at target capacity — deferred, not blocking the spec.

### 2. Author distributions, not particles (Tier 2)

Every varying property is authored as a **uniform range** `[min, max]`; the seeded RNG draws one sample per particle at birth. Evolution is split on two axes:
- **At birth** — a random draw from a range → variety *between* particles (`speed`, `angle`, `life`, `size`).
- **Over life** — a deterministic curve of the particle's own age → the arc *each* particle follows (`size` shrinking, `opacity` fading), expressed with the existing `Timing.ts` easing vocabulary.

Shared forces (e.g. `gravity`) are plain values, not ranges.

- *Why:* the API surface *is* "how they behave in general" — the author fills a config of ranges + curves and the seed does the rest; no loops, no per-particle code, ever. Uniform ranges + a couple of over-life curves cover fountains, jets, explosions, snow, embers, sparks — ~95% of real effects for a bounded, testable amount of code.
- *Alternative — richer distributions (gaussian/weighted) in v1:* deferred. Each is a new named descriptor that slots into the same "draw at birth" machinery additively; ship uniform first, add descriptors when a scene wants them.

### 3. Hold the line at Tier 2; reserve for Tier 3

Tier 3 = arbitrary per-property closures `fn(age, rng) → value`. Deliberately **not** built here, but **not** designed out. The distinction that makes Tier 3 a different system rather than a bigger menu: in Tier 2 the author hands us **data describing a curve** (a struct we interpret in a monomorphic, JIT-inlinable engine loop over the buffer); in Tier 3 the author hands us **the function itself** (a megamorphic indirect call per particle per frame the JIT cannot inline — reintroducing exactly the per-particle overhead the buffer design exists to kill).

The forward-compat move: **every particle carries its own PRNG state in the buffer from day one**, seeded from the runner at birth, even though no Tier-2 curve reads it. This is the concession to the user's point that per-particle independent PRNGs (branched off a runner-drawn seed) are the clean way to give particles randomness without exposing a shared RNG cursor. With the slot reserved, adding Tier 3 later is purely additive: a new per-property config kind (`fn` alongside `overLife`) and an eval branch that passes the particle its PRNG. No buffer layout change, no migration.

- *Why not build Tier 3 now:* the per-particle closure call is a real per-frame cost, and it is the last ~5% of expressiveness. Not worth paying in v1; cheap to add later given the reservation.
- *Determinism note:* determinism is the author's responsibility either way (a user can already break it with `Math.random` in a `Scene.update`). Tier 2 simply makes the deterministic path the path of least resistance; the reserved per-particle PRNG means Tier 3 can too.

### 4. Dual emission, unified as "birth N this frame"

Burst and stream are not two systems — they are two ways of writing into the same buffer. The emit step reduces to a single number: how many particles to birth this frame. **Burst**: all `count` on the emission frame, then nothing (`confetti`, impacts). **Stream**: `rate / frameRate` per frame, continuously until the sim stops (`snow`, embers, ambience). The integrate/kill/render machinery downstream is identical; emission mode is a branch at the emit step, so supporting both costs almost nothing over supporting one.

### 5. Fixed-capacity ring buffer, overwrite-oldest

Capacity is set at `instantiate`. When emission would exceed free slots, **overwrite the oldest live particles**. Chosen over drop-excess because it keeps density constant (the visible failure mode of drop-excess is a stuttering emitter under load). A `ponytail:` comment names the ceiling (fixed cap; grow-on-demand deferred).

### 6. `simulate(duration)` animator, phaser-once-per-frame

Advancing the field is one animator following the base/To + dual convention, dispatching on `Instance.isInstance`. Internally it mirrors `interpolate`'s loop shape from `Motion.ts`: for each frame it runs the pure step then `yield* Scene.tick` — **one** phaser arrival per frame for the whole field. Duration-based; the field simply stops stepping when the duration elapses (live particles may outlive an infinite/looped sim depending on their `life` — matches the "duration-based animations land the final frame exactly on target" invariant).

## Risks / Trade-offs

- **SVG node count is the real ceiling, not the simulation.** The buffer makes *simulating* thousands cheap, but each live particle is still an SVG element the sink emits and the browser lays out. The DOM, not our loop, becomes the wall at high counts. → Mitigation: document a realistic capacity guidance; the `ponytail:` note points at a batched/instanced sink as the upgrade path. This design deliberately does not solve rendering scale — only simulation scale.
- **SoA vs. AoS not settled.** → Mitigation: the choice lives entirely behind the field's data boundary; the spec constrains behavior, not representation. Decide with a benchmark during implementation; either satisfies the spec.
- **Reserved-but-unused PRNG slot is speculative weight.** Carrying per-particle PRNG state that no Tier-2 curve reads costs a few numbers per particle. → Mitigation: it is the single cheapest way to keep Tier 3 additive, and it is marked `ponytail:` so it can be dropped wholesale if Tier 3 is ever ruled out. Accepted deliberately.
- **Determinism depends on stable draw order.** If emission draws per-particle values in a different order across versions, seeded output shifts. → Mitigation: fix and document the draw order (which properties are sampled, in which sequence) as part of the spec's determinism requirement; treat a change to it as a breaking change, like the effect-version pin already is.
- **`simulate` semantics at scene end.** Live particles with remaining `life` when the sim's duration ends: do they finish their arc or freeze? → Resolve in spec (see Open Questions); leaning "the field stops emitting and integrating when the animator's duration ends," so the last frame is exact and reproducible.

## Open Questions

- **SoA vs. AoS** buffer representation — resolve with a capacity-target micro-benchmark during implementation.
- **Over-life curve set for v1** — `size` and `opacity` are the two that matter visually; is a `color`/tint over-life curve worth including now, or deferred with the richer distributions?
- **End-of-duration semantics** for still-live particles (finish-arc vs. freeze) — must be pinned in the spec for determinism.
- **Default capacity** when the author omits it — a sane bounded default (e.g. 1024) vs. requiring it explicitly.
