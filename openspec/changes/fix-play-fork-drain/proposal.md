## Why

A played scene whose body forks a branch as its last statement — the usual "exit tail, forked so it overlaps what comes next" — never finished: `Scene.play(child)` + `yield* handle.finished` hung the stream forever (no `maxFrames` defect). Every beat in the dogfood promo forks its exit tail, so none of them could be nested with `Scene.play`, and `motion frames` hung listing such a scene.

Two causes:

1. A branch fiber is a child of the fiber that spawned it. When the spawner ends in the same step, Effect interrupts the child before its first step — and an interruptible fiber cut before it runs skips its finalizers. `Phaser.run`'s party release and the branch's finish bookkeeping never ran, so the phaser waited forever on a party that would never arrive. Any branch spawned as the last statement of a played scene or of a fork could hit this.
2. Even with the leak fixed, the played scene's fiber returning cut its own forks, so a forked exit tail silently never played — unlike the same scene run standalone, whose end waits for its forks.

## What Changes

- `Phaser.run` forks uninterruptibly and installs its finalizers (a new optional `onExit` hook, then the party release) before entering the interruptible body, so a fiber cut before its first step still releases its slot. Branch bookkeeping (failure recording, finish) moves into that hook.
- A played scene's end includes the drain of the forks it spawned, as a standalone scene's does: the last one to finish finishes the played branch synchronously, so `handle.finished` resolves on the same frame boundary as for a child without forks. The child's backgrounds and finished tails are cut when it ends. `Scene.finish` inside the child still hands off early.
- A scene whose body spawns only backgrounds now yields one resting frame — exactly what an empty body yields — instead of zero (the old zero came from the leaked slot).

## Capabilities

### Modified Capabilities

- `scene-play`: a played scene's end waits for its own forks.
- `scene-fork`: a branch cut before its first step releases its party and finishes.

## Impact

**`packages/motion`** — `Phaser.ts` (`run` gains an optional `onExit`), `Scene.ts` (`forkBranch`, `play`). No public type changes beyond the optional parameter.

**Determinism** — frames are unchanged for scenes that never fork at the end of a played scene or fork, except background-only bodies (0 → 1 resting frame). A fork spawned as a fork's last statement is still cut with its spawner (Effect's structured concurrency); it just no longer deadlocks.
