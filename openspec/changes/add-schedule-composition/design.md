# Design: schedule-driven composition

## Context

Scene time is discrete: one phaser phase = one frame, and scene time in ms is `frameCount * 1000 / frameRate`. Effect `Schedule` is stateful and speaks continuous ms: `Schedule.toStep(schedule)` yields a step function `(now, input) → Effect<[output, decision]>` whose state advances on every call. The engine's concurrency backbone is the `Phaser` (packages/motion/src/Phaser.ts): parties arrive at each frame boundary; `Phaser.run` registers a party synchronously before forking and deregisters via finalizer; `arriveAndAwaitAdvance` already rolls back a phantom arrival when a party is interrupted mid-frame.

`Scene.step` (packages/motion/src/Scene.ts) is pull-based; nothing in the engine pre-buffers. The React player collects all frames eagerly, which assumes finite scenes.

## Goals / Non-Goals

**Goals:**
- Pace scene work with any Effect `Schedule`, evaluated in scene time.
- Sequential repetition (`Scene.repeat`), staggered parallel release (`Scene.all`), and concurrent work (`Scene.fork` / `Scene.background`).
- Safe-by-default bound on frame production, with an explicit escape hatch.

**Non-Goals:**
- A virtual frame Clock (TestClock-style) making all Effect time combinators work natively — heavier rearchitecture, revisit if a third/fourth time-based combinator gets ported.
- Streaming/infinite playback in the React player (follow-up change).
- Scene nesting, `Scene.finish`, Effectable scenes (separate change: `effectable-scenes`).

## Decisions

### D1: Schedule driver — one step call per decision, never polled

`Schedule.spaced(1000)` answers "1000ms from now" *relative to when it is called*, so calling the step function every frame to "check" would push the target forward forever. The driver calls `stepFn` exactly once per decision, at the moment of the decision (schedule start or effect/release completion), stores the resulting target time, and ticks frames until `sceneNowMs >= target`. Target-to-frame conversion rounds each absolute target once (no accumulation of rounded deltas), so stateful schedules keep their own continuous bookkeeping and there is no drift.

The driver lives beside `Time.toFrames` and is internal (not exported from the package index) until a public use case appears.

### D2: `Effect.repeat` conventions for `Scene.repeat`

First run is immediate; the schedule paces the gaps *after* runs; the effect's output is fed to the schedule as input (enabling `Schedule.recurWhile` etc.); the combinator completes when the schedule is done. `Schedule.fixed` therefore gives cadence catch-up without overlap (a 2s animation on a 1s fixed schedule re-fires immediately), `spaced` waits the full gap after completion — both inherited, not reimplemented.

### D3: `Scene.all` stagger — schedule bounds releases; leftover effects are skipped

With `{ schedule }`, effect 0 is released immediately and each subsequent release waits for the next schedule emission. When the schedule ends before all effects are released, the remaining effects are **not run** — the schedule is the release policy including how many. (`Schedule.recurs(3)` over 5 effects releases 3.) Users who want everything released express it in the schedule. `Scene.all` resolves once all *released* effects finish, and reports how many were released so truncation is observable. Party accounting is incremental `register(1)` per release (controller holds one party and ticks between releases), a variation of `Phaser.all`'s slot lending.

Alternative rejected: "release the rest immediately on exhaustion" — makes the schedule mean two different things before and after exhaustion.

### D4: `fork` waits, `background` is interrupted

- `Scene.fork(effect)`: registers a party synchronously (reusing the `Phaser.run` pattern with the ambient phaser), forks, returns a fiber handle. The scene's **physical end waits** for forked fibers. Rationale: a scene containing only a forked animation must play, not end instantly at zero frames. This inverts Effect's own `fork` (interrupt-children-at-end) — documented loudly on the combinator.
- `Scene.background(effect)`: same registration, but the fiber is **interrupted when the scene body completes** — for `Schedule.forever` backgrounds (bouncing ball for the scene's duration) that must not block scene end. The phaser's existing interrupt rollback handles mid-frame interruption.

Composition note: `Scene.repeat(Scene.fork(particle), schedule)` spawns overlapping particles (fork returns immediately, so repeat is not blocked) and the scene drains naturally — it ends when the last spawned particle finishes.

### D5: Scene-end sequencing — root party deregisters before joining forks

When the body finishes with forks outstanding, the root fiber will never arrive again; if its party stayed registered, quiescence would deadlock. Sequence at body end: deregister the root party → join outstanding `fork` fibers (each holds its own party, frames keep flowing) → interrupt `background` fibers → close scope, flip `done`. This is the slot-lending idea from `Phaser.all` applied at scene end, and the trickiest part of the change.

### D6: `maxFrames` setting, enforced in `Scene.step`

`Runner.Settings` gains `maxFrames` (default: 36_000 = 10 min at 60fps). `Scene.step` counts frames delivered and fails with an error naming the setting when exceeded. `maxFrames: Infinity` is the explicit infinite-scene opt-in — typing `Infinity` *is* the declaration; no new scene constructor or type. Enforcing in `step` (consumer side) rather than in the tick keeps the scene code path untouched and catches every producer shape (forks, backgrounds, repeats) uniformly.

## Risks / Trade-offs

- [D5 party-accounting bug ⇒ deadlocked or prematurely-ended scenes] → concentrate the logic in one place in `Scene.run`; test scene-end with 0, 1, N forks, a failing fork, and a background that is mid-frame at interrupt time.
- [`Scene.fork` naming clashes with Effect muscle memory (Effect's fork does not block scope end)] → prominent docstrings on both combinators; `background` named to avoid Effect's "detached/daemon = outlives scope" connotation, since it is the opposite.
- [Schedules emitting sub-frame gaps (e.g. `spaced(1ms)` at 60fps)] → targets round to frames; consecutive targets inside the same frame release in the same frame. Multiple releases per frame is allowed and correct (particle-per-frame use case).
- [`Schedule.toStep` is a beta-4 API and may shift] → driver isolates the dependency in one internal module; only the driver touches `toStep`.
- [Frame cap default surprises long finite scenes] → the failure names `maxFrames` and how to raise it; default is generous.

## Open Questions

- Exact shape of `Scene.all`'s return value (count released vs. array of released results). Leaning count + results of released effects.
- Whether `Scene.repeat` should return the final schedule output (as `Effect.repeat` does) or the last effect result. Leaning: mirror `Effect.repeat`.
