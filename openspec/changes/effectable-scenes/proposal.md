# Effectable scenes: nesting, finish, and scene metadata

## Why

Scenes should be the composable primitive of the library: a "movie" is just a scene that runs other scenes, controlling layout and transitions itself. Today a `Scene` is an inert `{ runner }` record that only `Scene.run` can consume, there is no way to run a scene inside another scene, and there is no way for a scene to signal "semantically done" (safe to start the next scene) while its tail animations keep playing — the signal that crossfade-style transitions need.

## What Changes

- `Scene` becomes a yieldable Effect (the `Effectable.Prototype` pattern already used by `Motion.wait` and Effect's own `Activity`): `yield* sceneA` inside another scene runs it inline; `Scene.fork(sceneA)` (from `add-schedule-composition`) runs it concurrently. **BREAKING** for any code touching the `Scene` object shape directly (internal only today).
- Per-scene-instance handle: each scene evaluation provides a fresh `SceneHandle` service around its body, carrying a `finished` latch and the scene's fiber. `Scene.finish` opens the innermost handle's latch; body completion opens it implicitly. Forking a scene returns the handle so a parent can `yield* handle.finished`.
- Semantic vs. physical end: `finished` (semantic) is observable independently of fiber completion (physical). Transitions and tail-limiting are user-land scene code (`yield* a.finished; …; yield* a.interrupt`) — no dedicated transition API.
- Parent-group context: `Scene.instantiate` resolves its default parent from a "current parent group" service (defaulting to root) instead of hardcoding root, so a parent scene can mount a child scene inside a group and the child's instances attach there.
- Scene metadata: Activity-style `annotations: Context` plus `annotate()` on the scene object — never read by the runtime, available to visual editors and tooling.
- Per-scene vs. per-movie dressing is made explicit: handle and parent-group are provided per scene evaluation; runner, phaser, settings, and seed remain per movie (outermost `Scene.run`).

## Capabilities

### New Capabilities
- `scene-nesting`: scenes as yieldable Effects, running scenes inside scenes, per-scene service scoping.
- `scene-finish`: the semantic-end signal, its handle, and implicit completion.
- `scene-mounting`: parent-group context for instantiation, enabling per-group scene placement and reuse.
- `scene-metadata`: annotation context on scene values.

### Modified Capabilities

None (no existing specs; `scene-fork` from `add-schedule-composition` is consumed as-is — forking a scene is just forking an effect).

## Impact

- `packages/motion/src/Scene.ts`: `Scene` interface and `make` (Effectable wrapper, handle provisioning, annotations); `finish`; `instantiate` default-parent resolution; `run` keeps per-movie dressing.
- `packages/motion/src/Runner.ts`: `InstantiateOptions` default parent comes from context; root group unchanged.
- `packages/react`: `usePlayer`'s `AnyScene` type erasure may simplify; behavior unchanged.
- Depends on: `add-schedule-composition` (uses `Scene.fork` to run scenes concurrently). Should be implemented after it.
