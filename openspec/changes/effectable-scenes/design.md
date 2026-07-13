# Design: branch finish and nested scene playback

## Context

`add-schedule-composition` left exactly the machinery this change extends: the runner tracks `forks` (awaited at scene end), `backgrounds` (interrupted at scene end), and a synchronous `awaitedCount` that the frame consumer (`Scene.step`) reads to decide "scene over" without depending on the scene fiber's scheduling. `Scene.run` applies movie dressing (runner, root party, seed, done flag); scenes are plain `{ runner }` values consumed by it.

## Goals / Non-Goals

**Goals:**
- A branch-level semantic end: `Scene.finish` releases awaiters and stops blocking the parent, while the tail keeps playing until the parent ends.
- Explicit nested scene playback (`Scene.play`) with frame-for-frame seed stability versus standalone runs.
- Mounting a child scene's instances under a parent group; scene value reuse across mounts.
- Metadata channel for tooling.

**Non-Goals:**
- Effectable scenes (`yield* scene` directly). Rejected this round: it served composability framing, not a need — an explicit helper is simpler, avoids type-level risk around the entity phantom, and makes nesting visible at call sites.
- Finish-aware `Scene.chain`. Advancing on `finished` requires chain items to run in their own fibers (an inline item cannot continue past finish), dragging slot-lending into chain. Crossfades are fully expressible with handles (`play` + `yield* h.finished`); promote chain later if that proves clunky.
- A dedicated transition/sequencer API, or player awareness of `finished`.

## Decisions

### D1: finish = demotion from fork to background

Every branch (fork, played scene, root body) has a semantic end and a physical end. Awaiting constructs wait on the semantic end. `Scene.finish`:

1. opens the innermost branch handle's `finished` latch (idempotent; completion opens it implicitly — success, failure, or interruption);
2. demotes the branch once: `countAwaited(-1)` and moves the fiber from `forks` to `backgrounds`;
3. changes nothing else — the branch **keeps its phaser party** and keeps ticking. It is not the party release (`releaseRoot`-style): that is for branches that will never tick again; a finished branch still animates.

The tail bound falls out of existing background semantics: demoted branches are interrupted when backgrounds are — after the drain of still-awaited work, at the parent's end. No `interruptAfter` API; a parent that wants a shorter tail interrupts the handle's fiber itself.

Root-branch consequence: a top-level body that finishes and continues gets its tail cut when no awaited work remains (the consumer stops at the movie's semantic end). `Scene.step`'s scene-over path must therefore interrupt-then-await the scene fiber rather than only await it (interrupting an already-completed fiber is a no-op, so the ordinary path is unchanged).

### D2: branch handles from fork and play

`Scene.fork` and `Scene.play` return the same handle shape — at least `{ finished, fiber }` — so forks and nested scenes are awaited, finish-observed, and interrupted identically. The handle context is provided per branch; `Scene.finish` resolves the innermost one (nesting scopes it: each branch's provision shadows its parent's for its subtree). The root branch's handle is provided by `Scene.run`.

### D3: scenes stay plain values; `Scene.play` carries the per-evaluation dressing

`Scene.play(scene, { parent?, seed? })` = fork of the scene body wrapped in: fresh scope, fresh branch handle, fresh seeded Random, current-parent provision. Sequential nesting is `play` + `yield* handle.finished`; concurrent nesting is play without awaiting. `Scene.run` uses the same per-evaluation dressing for the root (it is the outermost evaluation) plus the movie-global parts (runner creation, root party, done flag).

### D4: seed stability by equivalence

Rule: `play(scene)` inside a movie seeded `S` produces the same frames as `run(scene, { seed: S })` standalone. Therefore every evaluation reseeds a **fresh** Random stream (never inherits the parent's stream position); the default evaluation seed is the movie's seed value, `play({ seed })` overrides per mount. Two same-seed mounts of one scene are identical twins — determinism as a feature, per-mount seed as the variation knob. Movie-global settings shrink to what is genuinely global: `frameRate`, `maxFrames`.

### D5: parent-group via ambient service, defaulting to root

A current-parent service (default: the runner's root group) supplies `instantiate`'s default parent; explicit `options.parent` wins. `play({ parent: group })` provides it for the child's evaluation. Instances are created per evaluation, so one scene value mounts many times independently.

### D6: annotations ride the scene value

`annotations: Context` plus `annotate(key, value)`/`annotateMerge(context)` returning a new scene value sharing the same body; runtime never reads them.

## Risks / Trade-offs

- [Demotion races the frame consumer: `awaitedCount` may hit 0 mid-frame] → demotion is synchronous (same discipline as the count's finalizers); the consumer's next pull observes a consistent state. Test: finish with other forks still awaited (scene must NOT end), finish as the last awaited branch (scene ends, tail interrupted).
- [Double demotion (finish then completion)] → one guard flag per handle; completion of an already-finished branch must not decrement again.
- [Interrupting the root tail loses a failure cause] → interrupt-then-await preserves an already-failed exit; test a body that fails after finish… note: post-finish failures in a tail are reported like background failures (i.e. not at all) — document this on `finish`.
- [Seed equivalence broken by mount context (parent group affects instance ids)] → instance ids come from the movie-global counter; equivalence is defined on data/shape, not ids. Spec the equivalence over rendered values, not id strings.

## Open Questions

- Handle surface beyond `{ finished, fiber }` — e.g. `result`? Start minimal.
- Whether `Scene.run` should expose the movie's root handle (player "done + tail" states). Deferred until a player needs it.
