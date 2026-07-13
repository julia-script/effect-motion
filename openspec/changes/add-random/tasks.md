# Tasks: Add Deterministic Randomness

## 1. Wiring

- [x] 1.1 `Runner.Settings.seed?: number | string` with `Seed` type and documented `defaultSeed` constant; documented cross-version caveat (design D1/D2)
- [x] 1.2 `Scene.run` pipes the scene through `Random.withSeed(runner.settings.seed)` scoped to the scene fiber (design D3)

## 2. Tests (test/random.test.ts)

- [x] 2.1 Scene-driven: effect combinators (`nextBetween`, `choice`) work in a scene with zero layer plumbing; same settings → byte-identical frames across two runs; different seeds → different sequences; default seed is deterministic (design D5)
- [x] 2.2 Parallel lanes: a `Phaser.all` scene consuming randomness in both branches produces identical frames across two runs (design D4)

## 3. Verify

- [x] 3.1 `pnpm check`, `pnpm lint`, `pnpm test` green
