## 1. Pin the bug with a failing test

- [x] 1.1 Add a failing regression test in `packages/motion/test/fork.test.ts` under the `Scene.background` describe: a scene body whose only statement is `Scene.background(finite animation)`, consumed through `Scene.stream`. Give it an explicit short `timeout` so the deadlock fails fast instead of hanging the suite. Confirm it TIMES OUT before any source change.
- [x] 1.2 Add the endless variant: body is only `Scene.background(Scene.repeat(bounce, Schedule.forever))`. Assert it ends rather than running to the `maxFrames` cap. Confirm it also fails before the fix.
- [x] 1.3 Record the baseline: run `pnpm --filter effect-motion test` and note the current pass count (248 at time of writing). This is the no-regression gate for task 4.1. **Confirmed: 248 passing.**

## 2. Fix the liveness hole in `step`

- [x] 2.1 In `packages/motion/src/Scene.ts`, change `step` so the scene-end condition (`done || awaitedCount() === 0`) is not evaluated only once before `awaitAdvance`. Per design D1, the fix belongs in `step`, NOT in `Phaser` — do not teach the phaser about backgrounds, and do not add a timeout or poll to `awaitAdvance`. **Done: `awaitAdvance` is raced against `Fiber.await(runningScene.fiber)`; losing the race re-enters the end path.**
- [x] 2.2 Keep the fix off the hot path (design D3): no extra per-frame allocation or scheduler hop once the body is running. The stale-sample window is a startup-only condition. **Reuses the existing scene fiber — no new state, no timers, no polling.**
- [x] 2.3 Do NOT add backgrounds to `awaitedCount()` and do NOT reorder `runner.backgrounds.add` in `forkBranch` as the fix — design D1 records that hoisting the add was tried and measured ineffective (`bg=0` at the first `step`, because the body has not run at all). **Neither was touched; `Phaser.ts` is unmodified.**
- [x] 2.4 Verify with `phaser.snapshotUnsafe()` that the scene no longer parks with `parties=1, arrived=0, state="idle"` while `awaitedCount()` is 0. **`step` now returns `null` (scene end) instead of blocking. The orphaned background party remains in the counters but is no longer awaited — see 5.3.**

## 3. Confirm the fix and its blast radius

- [x] 3.1 Both tests from group 1 pass. **Terminate in ~3ms instead of timing out.**
- [x] 3.2 Observe and pin the actual frame count a background-only scene produces (design D2 leaves this to the natural end path — expected 0 or 1, mirroring the empty-body case). Assert the observed value so it cannot drift silently. **Observed 0, not 1 — a background is not content, so the scene ends before producing a frame. Assertions updated to the measured value.**
- [x] 3.3 Re-verify the shapes that already worked still do, with unchanged frame counts: `fork(anim)` only → 13 frames; empty body → 1 frame; `background(anim)` + `sleep` → 7 frames. **All three confirmed unchanged.**
- [x] 3.4 Check the design's open question: confirm `Scene.play` is unaffected (it forks with `kind: "fork"`, so it is counted — verify rather than assume, since `play` has its own group-mounting bookkeeping). **Confirmed: play-only body → 13 frames, play + awaited `finished` → 14 frames. Neither hangs.**

## 4. Guard against regressions

- [x] 4.1 Run `pnpm --filter effect-motion test` and confirm no test regressed against the 1.3 baseline. Pay particular attention to `fork.test.ts` (drain ordering), `finish.test.ts` (demotion), and `determinism-baseline.test.ts` (exact frame counts) — a changed frame count is a regression, not an acceptable diff. **250 passing = 248 baseline + 2 new. No frame count changed.**
- [x] 4.2 Run `pnpm test` across the workspace (renderer, react, cli, export, create-effect-motion). **All six packages green, 302 tests.**
- [x] 4.3 Run `pnpm check`. If the renderer reports `Cannot find module 'effect-motion/...'`, rebuild core first (`pnpm --filter effect-motion build`) — that is a stale-`dist` artifact, not a code error. **13/13 after rebuilding core, as anticipated.**
- [x] 4.4 Run `pnpm lint`. No non-null assertions and no biome-ignore suppressions; use the `unreachable` helper where a value is known present but typed nullable. **Clean (one formatting autofix, no rule violations).**

## 5. Documentation

- [x] 5.1 Update the `Scene.background` TSDoc in `packages/motion/src/Scene.ts` (~line 1046): drop "Always pair one with something that defines the length", which documents the hang as intended. Reframe pairing as advice about producing useful output. Keep the accurate parts: backgrounds never delay scene end, and "scene end" includes the fork drain. **Now states such a body ends immediately and produces NO frames; pairing is framed as "or the ambient motion never gets a frame to play on".**
- [x] 5.2 Grep the docs site for any prose repeating the old constraint (`apps/docs/content/docs/`) and correct it if present. **None found — `concepts/composition.mdx` already says "without keeping it alive", which stays correct.**
- [x] 5.3 Add a `ponytail:` comment only if the fix knowingly leaves a ceiling (e.g. a narrower guard than the general case); name the ceiling and its upgrade path. **Not needed — no ceiling. Verified the `step` re-entry always terminates: the scene fiber completes once, so losing the race guarantees the end-check fires on re-entry (5 repeated `step` calls after scene end all return `null`, no unbounded recursion).**
