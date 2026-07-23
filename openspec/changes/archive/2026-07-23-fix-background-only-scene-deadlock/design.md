## Context

`Scene.stream` on a background-only scene never yields a frame and never
completes. The consumer blocks forever — no failure, no `maxFrames` trip.

### The mechanism, measured

Instrumenting `phaser.snapshotUnsafe()` around a blocked `Scene.step`
(background-only body, finite background animation):

```
t0 (before step): {"phase":0,"parties":1,"arrived":0,"state":"idle"}  awaited=1 bg=0
step -> TIMEOUT
t1 (after step):  {"phase":0,"parties":1,"arrived":0,"state":"idle"}  awaited=0 bg=1
```

Read the two rows together — the party *count* is unchanged at 1, but the party
*identity* silently swapped:

1. `Scene.run` forks the body and returns. Only the root is registered:
   `parties=1`, `awaited=1`, `backgrounds` empty.
2. The consumer calls `step` **before the forked body has been scheduled**.
   `done` is false and `awaitedCount()` is 1, so the end-check at
   `Scene.ts:378` does not fire. `step` falls through to `awaitAdvance`.
3. `awaitAdvance` sees `arrived(0) !== parties(1)`, so it takes the
   "parties still running toward their next arrival (e.g. scene startup)"
   branch and sets `state = "running"`, intending to resolve at the first
   quiescence (`Phaser.ts:100`).
4. *Now* the body runs. `Scene.background` → `forkBranch` → `Phaser.run`
   registers the background party **synchronously** (`Phaser.ts:138`). The body
   then returns, `releaseRoot` deregisters the root, and `awaited` drops to 0.
5. Net effect: `parties` is still 1, but it is now the *background's* party.
   The background is suspended and will never arrive, so `arrived === parties`
   never holds and quiescence never fires. The waiter is gone and `state` is
   back to `"idle"` — nothing re-arms it.

Everything needed to end the scene is true at `t1` (`awaited=0`, `done=true`,
the background is tracked) — `step` simply evaluated its end-check once, before
any of it was true, and then parked on a condition that can no longer occur.

### Why forks don't hit this

`forkBranch` calls `runner.countAwaited(1)` **before** forking for `kind ===
"fork"`, but deliberately not for backgrounds (`Scene.ts:880`) — a background
must never hold a scene open. So `awaitedCount()` never rises on the background
path, and a background-only body drops the root count to 0 with no counted work
left. A fork-only scene is safe because its count is non-zero across the whole
window. This asymmetry is exactly the gap.

Confirmed scope (`Scene.stream`, 1.5s timeout): `background(anim)` alone →
TIMEOUT; `fork(anim)` alone → 13 frames; empty body → 1 frame;
`background(anim)` + `sleep` → 7 frames. Finite vs `Schedule.forever` makes no
difference, so `repeat` is not implicated.

## Goals / Non-Goals

**Goals:**

- A background-only scene terminates instead of blocking forever.
- Preserve the existing background contract: never extends a scene, still
  interrupted at scene end, still animates through the fork drain.
- Keep frame counts for every currently-working scene byte-for-byte unchanged.
- Leave a regression test at the shape that broke (background-only), since its
  absence is why this survived.

**Non-Goals:**

- Changing what a background renders, or when it is interrupted.
- Reworking the fork drain or `Scene.finish` demotion.
- Making backgrounds able to extend a scene.
- Fixing `Effect.tap` applied to a bare `Instance` in user code (not a library
  API path).

## Decisions

### D1: Fix the liveness hole in `step`, not in `Phaser`

**Decision:** `step` must not commit to a single end-check evaluated before the
scene body has run. It should either re-evaluate the end condition when the
phaser reaches quiescence, or avoid parking on an advance that cannot arrive.

**Why here:** the bug is that `step` samples `done`/`awaitedCount()` once, at
the one moment they are guaranteed stale — before the forked body is scheduled.
The phaser is behaving exactly as specified: it is holding for a registered
party that has not arrived. Nothing in `Phaser` knows which parties are
"content" and which are backgrounds; that is runner-level knowledge. Encoding
scene-end policy into the phaser's quiescence check would put scene semantics
inside the generic barrier.

**Alternatives considered:**

- *Track backgrounds in `runner.backgrounds` before forking.* Tried and
  reverted during investigation. It does not work: at the first `step` the body
  has not run at all, so `bg=0` regardless of ordering inside `forkBranch`. No
  bookkeeping change on the background path can close a window that opens
  before that path executes. Measured: `bg=0` at `t0` even with the add hoisted.
- *Count backgrounds in `awaitedCount()`.* Directly contradicts the
  requirement that backgrounds never delay scene end, and would make every
  `Schedule.forever` background hang the scene until `maxFrames`.
- *Make `awaitAdvance` time out or poll.* Reintroduces wall-clock behavior into
  the one component whose whole purpose is frame-exact scheduling.

### D2: Ending a background-only scene produces no frames

**Decision:** such a scene ends immediately; a background is not content, so
there is nothing to render.

Consistent with the existing TSDoc ("the background is not content") and with
the empty-body case, which already produces a single settle frame today. The
implementation should let the existing end path decide the exact count rather
than hard-coding one — the spec scenario asserts "ends without hanging", not a
specific number, so whichever the natural path yields is acceptable as long as
it is finite and stable.

### D3: Keep the fix off the hot path

`step` runs once per frame for every scene. Whatever re-check or wakeup is
added must not introduce a per-frame allocation or an extra scheduler hop in
the common case where the body is already running. The `t0`-only window is a
startup condition; the fix should cost nothing after the first advance.

### D4: Correct the `Scene.background` TSDoc

`Scene.ts:1046` currently instructs authors to "Always pair one with something
that defines the length" — written to describe the hang as intended. After the
fix, pairing is advice about producing useful output, not a hang workaround.
The `Instance.ts` precedent from the `Motion.wait` fix applies: a comment that
documents a bug as a constraint keeps the bug alive.

## Risks / Trade-offs

- **The phaser's quiescence invariant is load-bearing for every scene.** A
  regression is silent and global — wrong frame counts rather than a crash.
  → Mitigation: the 248 existing `packages/motion` tests are the gate, with
  particular attention to `fork.test.ts` (drain ordering), `finish.test.ts`
  (demotion), and `determinism-baseline.test.ts` (exact frame counts). Any
  change in a frame count is a regression, not an acceptable diff.

- **Startup races are timing-dependent and can hide.** The bug reproduces
  deterministically today, but a fix that merely reorders scheduling could
  paper over it.
  → Mitigation: the regression test must exercise the real consumer
  (`Scene.stream`), which is where it was measured, and assert termination
  rather than a sleep-based heuristic.

- **`maxFrames` did not catch this.** The cap only trips on the frame-producing
  path; a scene blocked before its first frame never reaches it.
  → Accepted: out of scope here, but worth noting that the cap is not a
  backstop for pre-first-frame liveness.

## Migration Plan

No migration. No public signature changes, and no scene that works today
changes behavior — the only affected shape currently hangs, so there is no
observable behavior to preserve. Rollback is reverting the commit.

## Open Questions

- **Exact frame count for a background-only scene.** D2 defers to whatever the
  natural end path produces (0 or 1, mirroring the empty-body case). Worth
  pinning in the test once observed, but it should not drive the design.
- **Does the same pre-first-frame window affect `Scene.play`?** A nested scene
  goes through `forkBranch` with `kind: "fork"`, so it is counted and should be
  safe — but `play` mounts a group and has its own bookkeeping, so it is worth
  one explicit check during implementation rather than assumed.
