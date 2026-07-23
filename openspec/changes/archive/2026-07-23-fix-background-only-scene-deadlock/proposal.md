## Why

A scene whose body contains only `Scene.background(...)` deadlocks: it produces
**zero frames** and never completes. The consumer hangs forever rather than
failing, so there is no error, no `maxFrames` guard, and no diagnostic — the
process simply stops.

This is a startup race, not the documented "backgrounds don't hold a scene open"
behavior. `Scene.fork` already avoids it by counting its branch synchronously
*before* forking; `Scene.background` deliberately does not count, and nothing
else covers the window. The equivalent fork case is pinned by a spec scenario
("Fork-only scene still plays"); the background case has no scenario, which is
why the gap survived.

Measured on the current tree (`packages/motion`, `Scene.stream` with a 1.5s
timeout):

| scene body | result |
| --- | --- |
| `background(anim)` only | **TIMEOUT — 0 frames** |
| `fork(anim)` only | 13 frames |
| body with no animation | 1 frame |
| `background(anim)` + `sleep` | 7 frames |

Only the background-only shape hangs, and it hangs regardless of whether the
background animation is finite or `Schedule.forever` — so `repeat`/`forever` is
not the trigger.

## What Changes

- Fix the startup race so a background-only scene terminates instead of hanging.
  Backgrounds keep their existing semantics: they never extend a scene, and they
  are still interrupted at scene end.
- A background-only scene SHALL end on its own, consistent with the existing
  rule that a background is not content and does not define length.
- Add regression scenarios for the background-only shape (currently untested,
  which is the root cause of the gap).
- Update the `Motion.background` TSDoc, which currently documents the hang as
  intended behavior ("Always pair one with something that defines the length" —
  `packages/motion/src/Scene.ts:1046`). After this change, pairing is a
  suggestion about useful output, not a requirement to avoid a hang.

Not in scope: changing what a background *renders*, its interrupt timing, or the
fork drain. This is a liveness fix.

## Capabilities

### New Capabilities

None. This corrects behavior already owned by an existing capability.

### Modified Capabilities

- `scene-fork`: the "Scene.background is interrupted at scene body end"
  requirement gains a background-only termination guarantee — a scene whose body
  spawns only backgrounds SHALL reach its end rather than blocking forever. This
  is a spec-level behavior change (hang → terminate), not just an
  implementation detail.

## Impact

- **Code**: `packages/motion/src/Scene.ts` — the `step` end-check and/or
  `forkBranch` background bookkeeping; possibly `packages/motion/src/Phaser.ts`
  if the fix belongs at the quiescence check. `Runner.BranchEntry` may need its
  `fiber` field to admit a pre-fork state.
- **Risk**: the phaser's quiescence invariant is load-bearing for *every* scene
  and every concurrency combinator (`all`, `fork`, `stagger`, `play`, `repeat`).
  A regression here is silent and global, so the design must justify where the
  fix lands and the existing 248 `packages/motion` tests must stay green.
- **Docs**: `Scene.background` TSDoc.
- **API**: no signature changes; no breaking changes for scenes that work today.
