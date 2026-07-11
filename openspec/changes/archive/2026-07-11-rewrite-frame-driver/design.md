# Design: Rewrite Frame Driver as a Phaser

## Context

The driver is a frame-stepping synchronization primitive for animation scenes built on Effect (v4 beta), in the style of motion-canvas: the controller (renderer/test) calls `awaitAdvance` to advance one phase (= one frame); scene code is composed of parties that run until their next `arriveAndAwaitAdvance`, which marks a phase boundary. The primitive is a **Phaser** — a dynamic barrier in the java.util.concurrent.Phaser sense — and uses its nomenclature. The old `src/Driver.ts` is discarded wholesale; this is a from-scratch implementation. The design is fully diagrammed in `diagrams/entry.mmd`, `driver_wait.mmd`, `lane_park.mmd`, `check_quiescence.mmd`, `run_scene.mmd`, `lane_one.mmd`, `lane_all.mmd` (drawn with the pre-rename vocabulary; see the nomenclature table below, and task 4.x relabels them). Those diagrams are the normative reference for the control flow.

## Nomenclature

| Diagram / old term | This design (java Phaser) | Meaning |
|---|---|---|
| driver | phaser | the primitive |
| frame | `phase` | monotonically increasing step counter |
| lane | party | a registered participant |
| registered | `parties` | count of live party slots |
| arrived | `arrived` | arrivals in the current phase |
| park | `arriveAndAwaitAdvance` | arrive at the barrier, await phase advance |
| wait / step | `awaitAdvance` | controller: arm + await one phase advance |
| frameLatch | `phaseLatch` | generation token |
| register/unregister | `register(n)` / `deregister(n)` | slot accounting |

## Goals / Non-Goals

**Goals:**
- `awaitAdvance` advances exactly one phase: resume all awaiting parties, resolve when every live party has arrived again (quiescence).
- Correct at any nesting depth: sequential (`one` after `one`), parallel (`all`), and nested (`all` inside `one` inside `all`...).
- No startup race: stepping works without a demo-side latch.
- Interruption/failure safe: no leaked registrations, no hung `awaitAdvance`.
- Stepping past scene completion returns immediately (`parties === 0` ⇒ empty phase).
- The primitive is generic — nothing animation-specific in `register`/`deregister`/`arriveAndAwaitAdvance`/`awaitAdvance`; animation semantics live only in the combinators.

**Non-Goals:**
- Draining ("advance until the whole scene completes") — trivially a loop over `awaitAdvance` later.
- Multiple concurrent controllers — single caller; concurrent `awaitAdvance` is a defect.
- java-Phaser features we don't need: `arrive()` without awaiting, `onAdvance` hooks, termination state, tiered parent/child phaser objects (nesting is handled by slot arithmetic in the combinators instead).
- Integration with `Runner.ts`/`Scene.ts`/rendering — separate change.
- Time/easing/tweening — the phaser only sequences phases.

## Decisions

### D1: Push-based dynamic barrier (phaser), not a pull-based generator tree
motion-canvas is pull-based (the player calls `next()` on a task tree). In Effect, parties are fibers, and fibers are push-scheduled; a pull design would require reifying every combinator as a steppable structure. A phaser (registered parties arrive at a barrier; an external controller observes quiescence) maps directly onto fibers + one shared mutable state. Cost: dynamic registration and generations must be handled explicitly — decisions D2–D5.

### D2: Single invariant, single checkpoint
All phaser behavior derives from one predicate — `arrived === parties` — evaluated in one function (`checkQuiescence`) called from **every** event that touches either counter: `arriveAndAwaitAdvance`, `deregister`, `awaitAdvance`, arrival-cancellation. Dispatch on controller state:
- `idle`: hold (all parties arrived, no waiter yet).
- `pending` (waiter armed): advance the phase (D3), then re-check (covers `parties === 0`, resolving the waiter immediately).
- `running`: resolve the waiter — phase complete.

Alternative considered: separate "advance" and "complete" code paths (the old code's shape). Rejected: every missed re-check site is a deadlock; centralizing makes each new event a one-line call.

### D3: Latch-per-phase as the generation token
`arriveAndAwaitAdvance` = capture `phaseLatch` into a local **first**, increment `arrived`, run the check, then await the *captured* latch. Phase advance = `phase++`, `arrived = 0`, swap in a fresh latch, set state `"running"`, **then** open the old latch. Because the swap precedes the open, a party that synchronously runs and re-arrives awaits the *new* latch and its arrival counts toward the new phase — no generation bleed.

Alternative considered: integer epoch numbers tagged on each arrival callback. Works, but the latch does both jobs (epoch identity + wakeup) with less bookkeeping, and Effect v4 ships `Latch`.

### D4: The slot model — root registers, `one` borrows, `all` splits N−1
`parties` counts *slots*: capabilities to either run-toward-an-arrival or be awaiting. A slot is not tied to a fiber; it flows down the call tree.
- `run(phaser, scene)`: `register(1)` **synchronously, before forking** the scene fiber. Between combinators the scene is registered-but-running, so `awaitAdvance` cannot resolve during sequential handoffs or before startup. `deregister(1)` in a finalizer (success/failure/interrupt).
- `one(effect)`: no registration — run effect, then `arriveAndAwaitAdvance`. Borrows the caller's slot.
- `all(effects)` with N branches: `register(N−1)` (the parent is blocked on `Effect.all`, neither running toward an arrival nor awaiting, so it must not hold a countable slot — its slot is lent to the Nth branch). Each branch that completes while others are still live deregisters one slot immediately (and re-checks — a finished branch must not hold the phase open). The **last** branch deregisters nothing: its slot is the parent's, returned by the parent resuming. A finalizer deregisters whatever is still held on failure/interrupt.

Every combinator enters with one slot and exits with one slot ⇒ composes at arbitrary depth with only local arithmetic. (This replaces java's tiered child phasers: same math, no extra objects.)

Alternatives considered: (a) register N in `all` and have the parent arrive while blocked — wrong, the parent can't arrive while suspended on `Effect.all`; (b) deregister-then-reregister at handoffs — rejected, creates windows of premature quiescence (the old code's startup-latch symptom).

### D5: Interruption accounting
- Registration release always lives in a finalizer adjacent to the register (acquire/release discipline).
- A party interrupted **while awaiting** decrements `arrived` in `arriveAndAwaitAdvance`'s cancellation handler (its arrival would otherwise be a phantom), then re-checks. Owner finalizers handle the matching `deregister` separately; both decrementing keeps the invariant consistent.
- `awaitAdvance` interrupted while suspended: clear `waiter`, state `"idle"`.

### D6: Externally paced — deliberate deviation from java's Phaser
java's Phaser auto-advances the moment the last party arrives. This phaser instead **holds at quiescence** until the controller calls `awaitAdvance`, which arms the advance and resolves at quiescence of the *new* phase.

`awaitAdvance` arms an advance **only if the phaser is already quiescent**; if parties are still running toward their next arrival (scene startup: root registered, fiber not yet at its first arrival), it just resolves at the first quiescence without advancing past it. Arming unconditionally (as the pre-implementation diagrams show) would make a startup-time `awaitAdvance` open the latch on the scene's first arrival and consume two phases of work in one call. Rationale: frame-stepping means the renderer paces the scene and must observe settled state between phases; auto-advance would let parties free-run. A second concurrent `awaitAdvance` is a defect (`Effect.die`) rather than queued — one controller by construction, and queueing would hide bugs. `awaitAdvance` with `parties === 0` resolves immediately (empty phase), which also covers stepping after the scene finished.

### D7: Semantics of `one(effect)`'s trailing arrival
`one` arrives *after* its effect completes, so an effect whose tail follows an inner `all` gets its own phase boundary. Deliberate: predictable phase counts beat clever coalescing. Revisit only if real scenes need "inner all's last phase = one's last phase".

### D8: Plain mutable state inside the service, synchronous transitions
Phaser state (`phase`, `parties`, `arrived`, `phaseLatch`, controller state, `waiter`) is plain mutation inside `Phaser.make`, transitions run synchronously on the fiber that triggers them (JS single-threaded; Effect callbacks resume synchronously where possible). No `Ref`/`SynchronizedRef`/STM — no concurrency across JS tasks touches this state, and the latch-capture rule (D3) already handles the only reentrancy hazard.

### D9: One module, from scratch
Everything ships in a new `src/Phaser.ts` — the primitive plus the animation combinators (`run`, `one`, `all`). The old `src/Driver.ts` is deleted, not migrated; the diagrams and this design are the only carried-over artifacts. Split the combinators out only when a second consumer of the bare primitive exists.

## Risks / Trade-offs

- [Effect v4 beta `Latch`/`Effect.callback` semantics shift under us] → Pin `effect@4.0.0-beta.94`; the design only needs "open resumes all awaiters" and "cancellation handler runs on interrupt", both stable primitives.
- [Synchronous resume reentrancy: opening the old latch runs parties that mutate counters mid-`checkQuiescence`] → The latch swap happens before the open (D3), and the post-open re-check is the *last* statement of the advance path; test with same-tick re-arriving parties.
- [Miscounted slots deadlock `awaitAdvance` silently] → Tests assert exact phase counts for sequential/parallel/nested scenes and use test timeouts; optionally expose a debug snapshot (`{phase, parties, arrived, state}`) for assertions.
- [A user-supplied party that never arrives and never completes] → `awaitAdvance` legitimately never resolves (an infinite synchronous phase). Out of scope to detect; document.
- [Name collision confusion with java's auto-advancing Phaser] → D6 documents the deviation; the module doc-comment states "externally paced" up front.
- [Concurrent `awaitAdvance` defect surprises future multi-consumer use] → Acceptable; revisit with a waiter queue if a real use case appears (D6).

## Open Questions

- None blocking. D7 (trailing-arrival coalescing) deferred until real scenes exist.
