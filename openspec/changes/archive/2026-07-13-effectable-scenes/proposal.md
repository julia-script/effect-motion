# Branch finish and nested scene playback

## Why

Scenes should compose: a "movie" is a scene that plays other scenes, controlling layout and transitions itself. Today there is no way to run a scene inside another scene, and no way for a branch of animation to signal "semantically done" (safe for whatever awaits it to proceed) while its tail keeps playing — the signal crossfade-style transitions need. There is deliberately nothing special about a scene versus any other fork: the only genuinely scene-specific needs are per-evaluation seeding (a nested scene must play exactly as it does standalone) and mounting (its instances should attach under a parent-designated group).

## What Changes

- Branch finish: every branch (a `Scene.fork`, a played scene, or the root body) has two ends — semantic (`Scene.finish` called, or implicitly, completion) and physical (the fiber stops). `Scene.finish` finishes the **innermost enclosing branch**: awaiters are released, the branch stops blocking its parent's end, and its tail keeps playing until the parent ends. Mechanically this is a demotion from fork to background: the branch leaves the awaited set but keeps its phaser party, and is interrupted when backgrounds are.
- `Scene.fork` (and the new `Scene.play`) return a branch handle exposing at least `finished` and the fiber, so parents can await semantic ends and bound tails by interruption.
- New `Scene.play(scene, options?)`: the explicit helper that runs a scene within a scene. Applies the per-evaluation dressing — fresh scope, fresh branch handle, fresh seeded Random, mount parent — and returns the branch handle. Scenes stay plain values (no Effectable wrapper); nesting is explicit.
- Seed stability: every scene evaluation reseeds a fresh Random stream. `play(scene)` inside a movie seeded `S` SHALL equal `run(scene, { seed: S })` standalone, frame for frame; `play({ seed })` overrides per mount. Seed becomes scene-evaluation context; the runner keeps only movie-global settings (`frameRate`, `maxFrames`).
- Parent-group context: `Scene.instantiate` resolves its default parent from a current-parent service (default: root), so `play({ parent: group })` mounts a child scene's instances under that group. Same scene value mounted twice creates independent instances.
- Scene metadata: `annotations` context plus `annotate()` on scene values — never read by the runtime, available to visual tooling.

## Capabilities

### New Capabilities
- `branch-finish`: semantic vs physical end of a branch, the finish demotion, handles from fork/play.
- `scene-play`: explicit nested scene playback with per-evaluation dressing and seed stability.
- `scene-mounting`: parent-group context for instantiation, per-mount instance independence.
- `scene-metadata`: annotation context on scene values.

### Modified Capabilities
- `scene-fork`: `Scene.fork` returns a branch handle (fiber + `finished`) instead of a bare fiber; scene-end drain awaits forks' **semantic** ends (finished forks are demoted to backgrounds and no longer block).

## Impact

- `packages/motion/src/Scene.ts`: branch handle context; `finish`; `fork` returns handles and supports demotion; `play`; `step`'s scene-over handling interrupts (not merely awaits) a demoted root's tail.
- `packages/motion/src/Runner.ts`: `forks`/`backgrounds`/`awaitedCount` gain a demotion path; `seed` leaves movie-global responsibility (kept as the default for evaluations); current-parent service default for `instantiate`.
- `packages/react`: unaffected.
- Builds directly on `add-schedule-composition`'s awaited-count and drain machinery.
