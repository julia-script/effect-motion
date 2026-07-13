# Add Deterministic Randomness

## Why

Scenes are pure functions of `(scene, settings)` — frame-exact tweens, settle-snapped springs, byte-identical re-renders. `Math.random()` (or an unseeded service) in a scene would be the first thing to break replay, golden tests, and reproducible renders. A seeded pseudo-random service, provided automatically to every scene, keeps randomness inside the determinism guarantee.

## What Changes

- **Scenes get effect's own seeded Random**: `Scene.run` wraps the scene with `Random.withSeed(settings.seed)`, so the entire effect `Random` combinator surface — `Random.next`, `Random.nextBetween(min, max)`, `Random.nextIntBetween`, `Random.nextBoolean`, `Random.shuffle`, `Random.choice` — is deterministic inside scenes with zero library random code. Accepted caveat (documented on the settings field): the generator algorithm belongs to effect, so upgrading effect may change seeded sequences; determinism is guaranteed within an effect version, not across them.
- **`Runner.Settings` gains `seed?: number | string`** with a fixed, documented default — a default-constructed scene renders byte-identically every run; variety is opt-in (the future user-facing seed knob).
- **Zero consumer plumbing**: `Random.Random` is a `Context.Reference` (has a default), so scene code using randomness adds nothing to the `R` channel.
- Documented invariant: parallel lanes (`Phaser.all`) share one sequential stream; determinism holds because fiber interleaving is deterministic (phaser resume order is insertion order; stepping has no wall clock). Per-fiber stream splitting is future work if ever needed.

## Capabilities

### New Capabilities

- `randomness`: Seeded randomness for scenes — automatic provision, seed in runner settings, determinism guarantees (same seed same output within an effect version, parallel-lane stability), and effect Random combinator compatibility.

### Modified Capabilities

<!-- none -->

## Impact

- `src/Runner.ts` (`Settings.seed`, `Seed` type, `defaultSeed`); `src/Scene.ts` (one `withSeed` line in `run`). No new modules.
- New `test/random.test.ts`; small playground touch optional.
- No dependency changes.
