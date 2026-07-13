# Design: Add Deterministic Randomness

## Context

effect v4 ships a `Random` module whose service is a tiny `Context.Reference<{ nextIntUnsafe(): number; nextDoubleUnsafe(): number }>` with all user-facing combinators (`next`, `nextBetween`, `nextIntBetween`, `nextBoolean`, `shuffle`, `choice`) as module helpers reading it from context — exactly the service-plus-helpers pattern this library uses. The Runner already owns per-scene settings (`frameRate`); `Scene.run` builds the Runner and wires services around the scene fiber.

## Goals / Non-Goals

**Goals:**
- Randomness inside the determinism guarantee: same `(scene, settings)` → byte-identical frames, including random values.
- Zero consumer plumbing: any scene can `yield* Random.nextBetween(...)` with nothing added to `R`.
- Determinism within an effect version: the random sequence a seed produces is stable for a given dependency set.
- Seed lives in `Runner.Settings` (user-facing exposure comes later, as planned).

**Non-Goals:**
- Per-fiber stream splitting (independent streams per parallel lane) — documented invariant instead; future work.
- Custom helper vocabulary (`Random.between` aliases) — effect's combinator names are the API; add aliases only if real usage demands them.
- Cryptographic quality — this is animation jitter, not key material.

## Decisions

### D1: Use effect's seeded Random wholesale
`Scene.run` wraps the scene with `Random.withSeed(settings.seed)` — no library PRNG code at all. Alternatives considered:
- *Owned algorithm behind effect's interface* (originally implemented, then removed): protects seeded sequences from changing when effect's internal generator changes, at the cost of ~60 lines and a golden test. Rejected after discussion: the simplicity of zero random code wins; the cross-version stability risk is accepted and documented on the settings field (determinism holds within an effect version — re-render reproducibility across effect upgrades is not guaranteed). If that guarantee ever becomes product-critical, the owned-generator approach slots back in behind the same seed setting with no API change.
- *Fully custom service + helpers*: reinvents shuffle/choice/etc. and creates a second Random vocabulary identical-looking to effect's. Rejected.

### D2: Seed in settings, fixed default
`Runner.Settings.seed?: number | string` (`withSeed` accepts both), defaulting to a documented constant. Reproducible-by-default matches everything else in the library; variety is opt-in. The Runner only *carries* the seed — the service is constructed at the provision site, since nothing else consumes it.

### D3: Provision in `Scene.run`, scoped to the scene fiber
`Scene.run` pipes the scene through `Random.withSeed(runner.settings.seed)` next to the existing Runner layer. Being a `Context.Reference`, `Random.Random` has a default — so `R` never grows for consumers, and scene code even runs outside `Scene.run` (falling back to effect's default, nondeterministic). Inside `Scene.run`, determinism is total.

### D4: One sequential stream across parallel lanes
`Phaser.all` branches consume from the same PRNG state. Deterministic because fiber interleaving is deterministic: phaser resume order is Set insertion order, and stepping contains no wall-clock anywhere. Documented as an invariant with a two-runs-identical test over a parallel scene; per-fiber splitting is the escape hatch if scheduling determinism ever changes.

### D5: Determinism enforced by same-run regression, not golden values
With the algorithm owned by effect, golden values would pin *their* internals — brittle without buying stability. Instead the suite asserts the guarantees the library actually makes: two runs with identical settings produce byte-identical frames (including through parallel lanes), and different seeds diverge.

## Risks / Trade-offs

- [effect upgrade changes the internal generator → seeded scenes render differently] → Accepted and documented (D1); re-render reproducibility across effect versions is explicitly not guaranteed. The owned-generator design is the recorded escape hatch.
- [Shared stream means adding/removing ANY random call shifts all subsequent values] → Inherent to sequential PRNGs; the seed makes runs reproducible, not edit-stable. Documented.

## Open Questions

- None blocking.
