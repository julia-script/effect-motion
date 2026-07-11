# Rewrite Frame Driver as a Phaser

## Why

The current `Driver` (src/Driver.ts) is an incomplete attempt at a frame-stepping synchronization primitive: its completion condition checks set non-emptiness instead of comparing arrivals against registered parties, it has no generation/epoch mechanism (a party that synchronously re-arrives pollutes the phase being completed), and registration is not interruption-safe. Demos require a startup `Latch` hack and nested combinators deadlock. The correct design — a dynamic barrier with latch-per-phase generations and an N−1 slot rule for nesting — has been worked out and documented in `diagrams/*.mmd`. That design is a **Phaser** (java.util.concurrent.Phaser), and the rewrite adopts Phaser nomenclature so the primitive reads familiarly and stays reusable beyond animation.

## What Changes

- **BREAKING**: Delete `src/Driver.ts` entirely; nothing from the old attempt is kept. New `src/Phaser.ts` written from scratch.
- Phaser nomenclature throughout: `phase` (was frame), `parties` (was registered lanes), `arrived` parties, `arriveAndAwaitAdvance` (was park), `awaitAdvance` (was wait/step), `register(n)`/`deregister(n)`, `phaseLatch`.
- Explicit phaser state: `phase`, `parties`, `arrived`, `phaseLatch` (generation token), controller `state` (idle/pending/running), `waiter`.
- Single shared invariant check (`checkQuiescence`): fires on every event that touches a count (arrival, deregister, awaitAdvance); the phase advances / the waiter resolves only when `arrived === parties`.
- Latch-per-phase generations: `arriveAndAwaitAdvance` captures the current latch before awaiting; phase advance swaps in a fresh latch **before** opening the old one, so synchronous re-arrivals count toward the new phase.
- Externally paced (deliberate deviation from java's Phaser, which auto-advances): the phaser holds at quiescence until the controller calls `awaitAdvance`, which arms the advance and resolves at quiescence of the new phase. One call = one phase = one animation frame.
- Animation combinators built on the primitive, in the same module: `run(phaser, scene)` registers the scene root party synchronously before forking (kills the startup race); `one(effect)` borrows its caller's party slot (run effect, then arrive); `all(effects)` implements the N−1 rule (register N−1, non-last finished branches deregister immediately, the last branch's slot returns to the parent). Composes at any nesting depth.
- All registrations released via finalizers (success, failure, interrupt); an interrupted awaiting party undoes its arrival.
- Concurrent `awaitAdvance` calls are a defect (single controller).
- Rewrite `src/demo.ts` from scratch (no startup latch) exercising sequential, parallel, and nested parties.
- Delete superseded `src/driver.mmd`; relabel `diagrams/*.mmd` to Phaser nomenclature.

## Capabilities

### New Capabilities

- `phaser`: Externally paced dynamic barrier — party registration/arrival accounting, generation-safe arrive-and-await, one-phase `awaitAdvance` semantics, and the sequential/parallel/nested composition combinators (`run`, `one`, `all`) for driving animation frames.

### Modified Capabilities

<!-- none — no existing specs in openspec/specs/ -->

## Impact

- `src/Driver.ts`: deleted. `src/Phaser.ts`: new (primitive + combinators; public surface: `awaitAdvance`, `arriveAndAwaitAdvance`, `register`/`deregister`, plus `run`, `one`, `all`).
- `src/demo.ts`: rewritten; `src/driver.mmd` deleted; `diagrams/*.mmd` relabeled.
- `test/`: new phaser tests (phase counting, nesting, interruption, empty phases).
- Depends only on `effect` (v4 beta `Latch`, `Effect.callback`); no new dependencies. `Runner.ts`/`Scene.ts` untouched for now (future integration).
