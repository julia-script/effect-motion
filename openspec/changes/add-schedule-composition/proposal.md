# Add schedule-driven composition

## Why

Scenes today can only sequence animations linearly (`yield*` one after another) or run them in lockstep parallel (`Phaser.all`). There is no way to pace work over scene time — repeat an animation on a cadence, stagger a group of animations, or run a background animation for the duration of a scene. Effect's `Schedule` is the natural vocabulary for pacing, but it speaks wall-clock milliseconds while the scene engine speaks discrete frames, so a bridge is needed. Unbounded repetition also makes infinite scenes possible, which the engine must guard against by default.

## What Changes

- New internal driver that steps any Effect `Schedule` against **scene time** (frames converted to ms at the runner's frame rate), calling the schedule's step function exactly once per decision — never polling per frame.
- New `Scene.repeat(effect, schedule)`: re-run an effect on a schedule, sequentially, in scene time. Mirrors `Effect.repeat` semantics (first run immediate, schedule paces the gaps, effect output feeds the schedule input).
- New `Scene.all(effects, options?)`: the public counterpart to the low-level `Phaser.all`. Without options it is a plain alias; with `{ schedule }` it staggers the *start* of each effect on the schedule. The schedule also bounds how many effects are released — effects beyond the schedule's recursion limit are skipped.
- New `Scene.fork(effect)`: run an effect concurrently as a phaser party; the scene's end **waits** for forked work to finish.
- New `Scene.background(effect)`: like fork, but the fiber is **interrupted** when the scene body ends — for indefinite backgrounds (e.g. a ball bouncing for the duration of the scene).
- New `maxFrames` runner setting (finite default) enforced in `Scene.step`; exceeding it fails with an error naming the setting. `maxFrames: Infinity` is the explicit opt-in to infinite scenes.

## Capabilities

### New Capabilities
- `schedule-driver`: bridging Effect `Schedule` to frame-based scene time (step-once-per-decision contract, ms→frame conversion).
- `scene-repeat`: repeating a single effect on a schedule in scene time.
- `scene-all`: public parallel combinator with optional schedule-staggered release.
- `scene-fork`: concurrent scene work — awaited forks and interruptible backgrounds, with correct phaser party accounting.
- `frame-cap`: bounded frame production by default, explicit opt-in to infinite scenes.

### Modified Capabilities

None (no existing specs).

## Impact

- `packages/motion/src/Scene.ts`: new `repeat`, `all` (replaces the empty stub), `fork`, `background`; `step` gains the frame-cap check; scene-end sequencing changes to await forks (root party deregisters before joining).
- `packages/motion/src/Runner.ts`: `Settings` gains `maxFrames`; runner tracks forked fibers (or exposes what fork needs).
- `packages/motion/src/Time.ts` (or new module): the schedule driver.
- `packages/motion/src/Phaser.ts`: unchanged in behavior; `fork`/`background` reuse the existing `Phaser.run` register-before-fork pattern and interrupt rollback.
- `packages/react`: unaffected. A streaming player mode for infinite scenes is deliberately out of scope (follow-up change); the existing collect-then-play player keeps working for all finite scenes, and the frame cap turns accidental infinite scenes into a clear error instead of a hang.
- Depends on `Schedule.toStep` from effect 4.0.0-beta (already the pinned version).
