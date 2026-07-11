# Tasks: Rewrite Frame Driver as a Phaser

## 1. Phaser core (new src/Phaser.ts, from scratch)

- [x] 1.1 Delete src/Driver.ts; create src/Phaser.ts with phaser state per design D8: `phase`, `parties`, `arrived`, `phaseLatch` (Effect `Latch`), controller state ("idle" | "pending" | "running"), `waiter` — plain mutable state; module doc-comment states "externally paced phaser" (design D6)
- [x] 1.2 Implement `checkQuiescence` per diagrams/check_quiescence.mmd: no-op unless `arrived === parties`; dispatch on state (idle → hold; pending → advance phase; running → resolve waiter); phase advance swaps in a fresh latch BEFORE opening the old one, then re-checks (covers `parties === 0`)
- [x] 1.3 Implement `arriveAndAwaitAdvance` per diagrams/lane_park.mmd: capture current latch first, `arrived += 1`, check, await captured latch; cancellation handler decrements `arrived` and re-checks
- [x] 1.4 Implement `awaitAdvance` per diagrams/driver_wait.mmd: die on concurrent call, set waiter + state "pending", check, suspend; interruption clears waiter and resets state to idle
- [x] 1.5 Implement `register(n)` / `deregister(n)`; deregister triggers the check

## 2. Combinators (same module)

- [x] 2.1 Implement `run(phaser, scene)` per diagrams/run_scene.mmd: `register(1)` synchronously before providing/forking; `deregister(1)` via finalizer on success/failure/interrupt, then check
- [x] 2.2 Implement `one(effect)`: run effect then `arriveAndAwaitAdvance`; no registration (borrows caller's slot)
- [x] 2.3 Implement `all(effects)` per diagrams/lane_all.mmd: `register(N−1)` and track live branches; each non-last completing branch deregisters one slot and re-checks; last branch deregisters nothing; finalizer deregisters all still-held slots on failure/interrupt

## 3. Tests (test/phaser.test.ts — scenarios from specs/phaser/spec.md)

- [x] 3.1 Phase advance: single party steps one phase; awaitAdvance doesn't resolve while a party still runs; empty phase resolves immediately; concurrent awaitAdvance dies
- [x] 3.2 Generations: a party that synchronously re-arrives on resume does not complete the old phase early (exact phase-count assertion)
- [x] 3.3 Root registration: awaitAdvance before scene fiber runs (no startup latch); scene interrupt deregisters the root slot and unblocks awaitAdvance
- [x] 3.4 Sequential: `one(a); one(b)` takes exactly two advances with correct ordering
- [x] 3.5 Parallel: `all` shares one phase across branches; different-length branches don't deadlock; branch failure deregisters slots and unblocks awaitAdvance
- [x] 3.6 Nested: `all` inside `one` (including the trailing-arrival extra phase per design D7) and `all` inside `all`
- [x] 3.7 Interruption: awaiting party interrupted mid-phase — awaitAdvance still resolves at remaining-party quiescence

## 4. Cleanup

- [x] 4.1 Rewrite src/demo.ts from scratch: no startup `Latch`, demo sequential + parallel + nested parties with exact expected phase logs
- [x] 4.2 Delete src/driver.mmd (superseded by diagrams/)
- [x] 4.3 Relabel diagrams/*.mmd to Phaser nomenclature per the design's table (park → arriveAndAwaitAdvance, frame → phase, lane → party, registered → parties, wait/step → awaitAdvance, frameLatch → phaseLatch); rename files/ids to match (driver_wait → await_advance, lane_park → arrive, run_scene stays, lane_one → combinator_one, lane_all → combinator_all) and update every cross-graph click target; verify each file still parses with mermaid-cli
- [x] 4.4 Run `pnpm check`, `pnpm lint`, `pnpm test` — all green
