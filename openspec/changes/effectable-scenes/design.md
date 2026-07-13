# Design: effectable scenes

## Context

`Scene` is currently `{ [TypeId], runner: Effect.scoped(Effect.gen(f)), "~entities" }` — a record only `Scene.run` consumes. `Scene.run` wraps the runner with per-movie dressing: `Random.withSeed`, the `done` flag `ensuring`, `Runner` provisioning, and `Phaser.run` root-party registration. `Motion.wait` already demonstrates the Effectable pattern in this codebase (an object that is both a function and an Effect via `Effectable.Prototype`); Effect's `Activity` demonstrates the fuller shape (Effectable + metadata + annotations Context).

The `add-schedule-composition` change gives us `Scene.fork` (awaited concurrent work) and correct scene-end party accounting; this change builds on both.

## Goals / Non-Goals

**Goals:**
- `yield* scene` inside another scene, and `Scene.fork(scene)` for concurrent scenes.
- A per-scene semantic-end signal (`Scene.finish` / `handle.finished`) consumed by parent scenes for transitions.
- Child scenes mount into a parent-designated group; scene reuse (same scene, two mounts).
- Metadata channel for future visual tooling.

**Non-Goals:**
- A dedicated transition/sequencer API — parent scenes ARE the sequencer; crossfades and tail limits are ordinary scene code.
- Player awareness of `finished` (a player could stop at outermost-finish + tail; follow-up if needed).
- Serializable scene descriptions for editors — annotations are a runtime Context only.

## Decisions

### D1: Scene extends Effect via Effectable.Prototype

`Scene<E, R, Entities>` extends `Effect.Effect<void, E, R'>`, with `evaluate` returning the body wrapped in **per-scene** dressing. `Scene.make` keeps its current signature and type-level entity extraction; it just returns an Effectable object instead of a bare record. `Scene.run` continues to exist as the movie entry point and keeps the **per-movie** dressing.

Per-scene (inside `evaluate`, so nested scenes get it): `Effect.scoped`, fresh `SceneHandle` provisioning, parent-group capture.
Per-movie (in `Scene.run` only): `Runner.make`, `Phaser.run` root registration, `Random.withSeed`, `done` flag.

Alternative rejected: a separate `Scene.runNested(scene)` combinator without making Scene an Effect — more API surface, and every consumer (fork, repeat, all) would need scene overloads. Effectable makes scenes work with *all* effect combinators for free.

### D2: SceneHandle is a per-evaluation service

Each evaluation of a scene provides a fresh `SceneHandle` (Context service) around its body: `{ finished: Latch (or Deferred), fiber }`. `Scene.finish` opens the **innermost** handle's latch (ambient service lookup); body completion opens it implicitly via `ensuring`. Nesting scopes this correctly with no registry: each scene's `Effect.provide` shadows the parent's handle for its subtree.

Getting the handle out: `yield* scene` runs inline (handle not needed — completion IS the signal). For concurrent scenes, a `Scene.forkScene(scene)`-shaped helper (or `Scene.fork` overload detecting a Scene) returns `{ finished, fiber }` so the parent can `yield* handle.finished`, then later `Fiber.interrupt(handle.fiber)` for tail limiting. Exact shape settled in implementation; requirement is only that fork-of-scene exposes `finished` and interruption.

### D3: finish is a pure signal

`Scene.finish` changes nothing about execution — no interruption, no scope close, no effect on forks. The tail is whatever the body and its forks still do; the parent bounds it (`yield* a.finished; yield* Scene.sleep(...); yield* Fiber.interrupt(a.fiber)`). This keeps finish orthogonal to fork/background semantics. Calling `finish` twice, or finishing after implicit completion, is a no-op (latch semantics).

### D4: Parent-group via ambient service, defaulting to root

A `CurrentParent` service (defaulting to the runner's root group) supplies `instantiate`'s default parent; explicit `options.parent` still wins. Mounting a child scene into a group = providing `CurrentParent` for that child's evaluation — exposed as an option where scenes are run/forked (e.g. `{ parent: group }`). This is also what makes one scene value mountable twice into different groups: instances are created per evaluation, not stored on the scene.

### D5: Annotations ride the scene value, Activity-style

`annotations: Context.Context<never>` on the scene object plus `annotate(key, value)` / `annotateMerge(context)` returning a new scene sharing the same body. The runtime never reads them. This is deliberately the same shape as Effect's `Activity` so editor tooling has one idiom to learn.

## Risks / Trade-offs

- [Effectable typing: `Scene`'s entity-extraction generics must survive extending `Effect`] → the R channel already carries entities via `Extract`; keep `~entities` as a phantom field; follow `Motion.wait`'s casting discipline; verify with type-level tests.
- [Double dressing: a scene run via `Scene.run` must not get per-scene wrapping twice] → `evaluate` is the single place per-scene dressing lives; `Scene.run` consumes `scene` as an Effect like any parent would, plus movie dressing around it.
- [`finish` without a listener is inert] → fine by design; docstring notes it only matters to whoever holds the handle.
- [Seed/determinism across nesting: nested scenes share the movie's seeded Random] → document that determinism is per-movie; per-scene reseeding can be added later as an annotation/option if needed.
- [BREAKING shape change of `Scene`] → only `Scene.run`/`stream` and the react package touch the shape today; both are in-repo.

## Open Questions

- `Scene.fork(scene)` overload vs. distinct `Scene.forkScene`: does dispatching on `isScene` inside fork keep types clean, or is a separate name clearer?
- Should `Scene.stream`/`step` expose the outermost `finished` so players can render "done + tail" states? Deferred until a player needs it.
