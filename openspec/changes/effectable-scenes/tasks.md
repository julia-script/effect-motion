# Tasks: effectable-scenes (branch finish + Scene.play)

> Builds on the archived `add-schedule-composition` (awaited-count, forks/backgrounds sets, drain). Note the change keeps its original folder name; the content is the revised branch-finish/play design.

## 1. Branch handles and finish

- [ ] 1.1 Add the branch handle (latch `finished`, fiber, one-shot demotion guard) as a per-branch Context service; `Scene.fork`/`Scene.background` provide a fresh handle to their fiber and return it (handle exposes at least `finished` + fiber); `Scene.run` provides the root branch's handle
- [ ] 1.2 Implement `Scene.finish`: open the innermost handle's latch and demote once — `countAwaited(-1)`, move fiber from `forks` to `backgrounds`, keep the phaser party; completion opens the latch implicitly (success/failure/interrupt) without double-demotion
- [ ] 1.3 Scene-over handling: `Scene.step` interrupts-then-awaits the scene fiber (no-op for already-completed fibers) so a finished root's tail is cut instead of hanging; drain waits only on un-finished forks
- [ ] 1.4 Tests: tail keeps playing after finish while awaiters proceed; finished fork doesn't block scene end (tail interrupted with backgrounds); finish with other awaited forks pending keeps the scene alive; idempotent finish / finish-then-complete decrements once; implicit finish on completion; root finish ends an otherwise-infinite body; parent-bounded tail via handle interrupt; crossfade shape (play A, await finished, fade + play B)

## 2. Scene.play

- [ ] 2.1 Implement `Scene.play(scene, { parent?, seed? })`: fork of the scene body wrapped in fresh scope + fresh branch handle + fresh seeded Random (default: the movie's seed value) + current-parent provision; returns the branch handle; refactor `Scene.run` so the root goes through the same per-evaluation dressing
- [ ] 2.2 Tests: sequential nesting (play + await finished; one continuous stream); concurrent nesting (two scenes share frames; parent end awaits both); nested finish targets the inner handle; child finalizers run at child end
- [ ] 2.3 Seed stability tests: nested-with-movie-seed-S equals standalone-run-with-seed-S (animated values frame-for-frame from the play point); per-mount `{ seed }` override diverges reproducibly; movie-global settings (`frameRate`, `maxFrames`) still apply to nested scenes

## 3. Mounting

- [ ] 3.1 Add the current-parent service defaulting to the runner root; `Runner.instantiate` resolves the default parent from it; explicit `options.parent` wins
- [ ] 3.2 Wire `play({ parent: group })` to provide it for the child's evaluation
- [ ] 3.3 Tests: top-level default still root; mounted child's instances attach under the mount group and move with it; explicit parent overrides mount; same scene value mounted twice creates independent instance sets

## 4. Metadata

- [ ] 4.1 Add `annotations: Context` to scene values with `annotate`/`annotateMerge` returning new values sharing the body; runtime never reads them
- [ ] 4.2 Tests: annotated scene plays identically; original value unchanged; annotations survive play/mount

## 5. Surface and docs

- [ ] 5.1 Export `finish`, `play`, handle types, mount options; docstrings covering semantic vs physical end, the fork→background demotion model, the parent-owns-the-tail pattern, and that post-finish tail failures are not reported
- [ ] 5.2 Docs site: "scenes compose" page — play/nesting, crossfade transition example (play A → await finished → fade + play B → bounded tail), seed stability, scene reuse via mounts; playable examples via the registry
