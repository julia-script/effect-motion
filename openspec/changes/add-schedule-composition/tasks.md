# Tasks: add-schedule-composition

## 1. Schedule driver

- [x] 1.1 Add the internal schedule driver next to `Time.toFrames` (in `Time.ts` or a sibling module): wrap `Schedule.toStep`, feed it scene-time ms, call the step function once per decision, expose "target frame" + "done" to callers; round each absolute target once
- [x] 1.2 Unit-test the driver: `spaced` (one step call per gap, no per-frame polling), `fixed` cadence catch-up, non-frame-aligned targets (`333 millis` at 60fps, no drift), sub-frame/past targets resolving without a tick, `recurs(n)` termination

## 2. Scene.repeat

- [x] 2.1 Implement `Scene.repeat(effect, schedule)`: immediate first run, gap in frames via `Scene.tick`/driver, effect output fed as schedule input, completes when schedule is done, failure short-circuits
- [x] 2.2 Tests: spaced (period = duration + gap), fixed with over-long effect (back-to-back, no overlap), `recurs(2)` = 3 runs, `collectWhile` on effect output (beta 94 has no `recurWhile`), failing second run propagates

## 3. Scene.fork and Scene.background

- [x] 3.1 Implement `Scene.fork(effect)`: synchronous `register(1)` before fork against the ambient phaser (reuse `Phaser.run` pattern), deregister via finalizer, track the fiber for scene-end join, return the fiber
- [x] 3.2 Implement `Scene.background(effect)`: same registration, fiber recorded for interruption at body end, return the fiber
- [x] 3.3 Rework scene-end sequencing in `Scene.run`: on body completion, deregister the root party, join outstanding forks, interrupt backgrounds, then close scope and flip `done`; propagate fork failures into the scene exit (plus: an `awaitedCount` on the runner so `Scene.step` decides "scene over" from synchronous bookkeeping — the hot frame loop can starve the scene fiber's own drain and leak frames otherwise)
- [x] 3.4 Tests: fork-only scene plays to completion; body-ends-first drain (no deadlock, `done` only after forks); background interrupted at body end incl. mid-frame; 0/1/N forks; failing fork fails the scene; manually interrupted fork releases its party

## 4. Scene.all

- [x] 4.1 Replace the empty `Scene.all` stub: no-options form delegates to `Phaser.all`; `{ schedule }` form releases effect 0 immediately, staggers the rest (implemented as up-front release-frame decisions — one driver step per release with live scene-time `now`s — then tick-until-release branches inside a plain `Phaser.all`, which owns all party accounting), skips effects past schedule exhaustion, resolves when all released effects finish, reports released count
- [x] 4.2 Tests: plain form matches `Phaser.all` behavior; staggered starts land on expected frames; completion not delayed by pacing; `recurs(2)` over 5 effects releases exactly 3; released count observable

## 5. Frame cap

- [x] 5.1 Add `maxFrames` to `Runner.Settings` (default 36_000) and enforce in `Scene.step`: fail with an error naming `maxFrames` and its value when exceeded; `Infinity` disables
- [x] 5.2 Tests: infinite scene fails at the cap with the named setting; finite scene under cap unchanged; `Infinity` never caps; custom cap respected

## 6. Surface and docs

- [x] 6.1 Export new combinators from the package index (already covered: `export * as Scene` re-exports `repeat`/`all`/`fork`/`background`); docstrings on `fork`/`background` calling out the inversion of Effect's fork semantics (fork waits, background is interrupted)
- [x] 6.2 Update the docs site: pacing/repeat/stagger page with the fork-vs-background rule of thumb and the `maxFrames` opt-in; extend `demo.ts` with a staggered + background example
