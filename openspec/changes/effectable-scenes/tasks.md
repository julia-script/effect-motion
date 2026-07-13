# Tasks: effectable-scenes

> Depends on `add-schedule-composition` (uses `Scene.fork` and its scene-end party accounting). Implement after it.

## 1. Effectable Scene

- [ ] 1.1 Rework the `Scene` interface and `Scene.make` to return an Effectable value (`Effectable.Prototype`, `Motion.wait`/`Activity` pattern) whose `evaluate` wraps the body in per-scene dressing: `Effect.scoped`, fresh `SceneHandle`, mount-context capture; preserve the entity-extraction generics and `~entities` phantom
- [ ] 1.2 Move per-movie dressing audit: `Scene.run` provides runner/phaser root party/seed/done exactly once and consumes the scene as a plain Effect; confirm no double-wrapping when a scene is both nested and run
- [ ] 1.3 Type-level tests: `yield*` of a scene inside `Scene.make` propagates E/R/entities; react package's `AnyScene` still typechecks (simplify erasure if possible)
- [ ] 1.4 Runtime tests: inline `yield* sceneA; yield* sceneB` produces one continuous frame stream; child finalizers run at child end; one runner/phaser for a nested movie

## 2. SceneHandle and finish

- [ ] 2.1 Add the `SceneHandle` service (finished latch + fiber), provided fresh per evaluation; `Scene.finish` opens the innermost handle's latch; body completion opens it via `ensuring` (success, failure, interrupt)
- [ ] 2.2 Expose the handle from fork-of-scene (decide: `Scene.fork` overload via `isScene` dispatch vs. `Scene.forkScene`) returning `{ finished, fiber }`
- [ ] 2.3 Tests: finish releases waiters while tail frames keep playing; idempotent finish; implicit finish on body end; nested finish opens inner latch only; crossfade sequence (fork A, await finished, fork B — overlapping frames); parent-bounded tail via sleep + interrupt

## 3. Mounting

- [ ] 3.1 Add the current-parent service defaulting to the runner root; `Scene.instantiate`/`Runner.instantiate` resolve default parent from it; explicit `options.parent` wins
- [ ] 3.2 Add the mount option where scenes are run/forked (`{ parent: group }`) providing the service for the child's evaluation
- [ ] 3.3 Tests: top-level default still root; mounted child's instances attach under the mount group and move with it; explicit parent overrides mount; same scene value mounted twice creates independent instance sets

## 4. Metadata

- [ ] 4.1 Add `annotations: Context` to scene values with `annotate`/`annotateMerge` returning new values sharing the body; runtime never reads them
- [ ] 4.2 Tests: annotated scene plays identically; original value unchanged; annotations survive fork/mount

## 5. Surface and docs

- [ ] 5.1 Export `finish`, handle types, and mount options from the package index; docstrings covering semantic vs. physical end and the parent-owns-the-tail pattern
- [ ] 5.2 Docs site: "scenes compose" page — nested scenes, crossfade transition example (fork A → await finished → fade + fork B → bounded tail), scene reuse via mounts
