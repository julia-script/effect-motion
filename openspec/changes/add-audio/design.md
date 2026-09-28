# Design: add-audio

## Context

Resources (`Font`, `Image`) are two-faced constants: yielding one in a scene adds a phantom, loader-branded requirement, and `Scene.run`/`stream` erase every loader-branded requirement (`Resource.ExcludeLoaders`) because frames never read bytes. Audio must keep that: a scene that only *references* a track produces frames with no bytes. But the spec also asks for an explicit duration query — a scene that reads real data about the asset. That dependency must not be erased. Animators follow AGENTS.md: base/To pairs, dual call forms, exact endpoints, no traits (fields gated by tag).

## Goals / Non-Goals

**Goals:** a byte-free audio reference; an explicit, typed, non-erasable duration query; exact per-frame `time`/`gain`; transport (play/pause/seek/stop/loop) the adapters can follow from frame data alone.

**Non-Goals:** playback, decoding, mixing, analysis — adapters and follow-ups.

## Decisions

### D1. `Audio.Audio` / `Audio.layer` copy the Image contract
`Audio.Audio("id")` → yieldable `AudioResource<ID>` (`.id`, `.Loader`, `.Metadata`); `yield*` gives `{ _tag: "effect-motion/Resources/Audio", id }` and adds `AudioLoader<ID>` (branded, `{ id, bytes }`). `Audio.Loader(id)` rebuilds the tag from a string. `Audio.layer(track, load)` runs `load` once at construction. Separate shape, shared brand.

### D2. Prepared metadata is a separate, UNBRANDED service
`AudioMetadata<ID>` = `{ id, duration }` (seconds, finite, ≥ 0), keyed `effect-motion/Resources/AudioMetadata/<id>`, with **no** loader brand. So `ExcludeLoaders` keeps it: a scene that runs `Audio.duration(track)` has `AudioMetadata<ID>` in the requirements of `Scene.run`/`stream`, and running it without a provider fails to typecheck. The query is explicit — declaring or playing a track never adds it.

Providers:
- `Audio.metadataLayer(track, { duration })` — already-prepared data; invalid duration dies at construction naming the track.
- `Audio.preparedLayer(track, load, inspect)` — loads bytes once and derives metadata from *those same bytes* with the adapter-supplied `inspect(bytes)`, providing `AudioLoader<ID> | AudioMetadata<ID>`. This is how browser (decode) and Node (probe) adapters keep metadata tied to playback bytes; core stays free of decoders.

Determinism inputs: frames are a pure function of `(scene, settings, prepared metadata)`. Reads and decoding happen at layer construction, before frame generation. The follow-up analysis capability (peaks/envelopes) adds fields or sibling services the same way.

### D3. The Audio entity: transform + audio fields, no appearance
`{ position, rotation, audio, time, gain, loop, playing }`. `gain` is linear amplitude (1 = unity, 0 = silent; values are passed through, adapters clamp below 0). No `opacity`/`scale`/`visible`: `Motion.fade` (opacity) is a compile error on audio, and gain is never multiplied by ancestor opacity. `Motion.tween`/`tweenTo({ gain })` work unchanged (gain is a numeric field). `position`/`rotation` exist only because every entity takes the transform mixin; they have no audio meaning in v1.

### D4. Transport state and frame semantics
- `playing` is explicit. A paused track (`playing: false`, stationary `time`) is distinguishable from a playing one.
- `time` is the **unwrapped** playback cursor in source seconds. Core never knows the source length, so it never wraps. Adapters derive the source position: `loop ? time mod duration : time`, silent once `time ≥ duration` without loop.
- While playing, `time` on frame `k` is exactly `anchorTime + (k − anchorFrame) / frameRate` — derived, not accumulated, so there is no drift. The Runner resolves a playing cursor whenever the track's data is read (`Scene.data`, animators) and when the frame is snapshotted, so a seek/pause/resume on frame `k` shows on frame `k` regardless of fiber order, and the scene's last frame is exact too.
- **Transport ownership.** `playing`/`time` are transport-owned but remain plain data; the anchor is inferred from what is written. A track seen playing without an anchor (just resumed, or instantiated with `playing: true`) is anchored at its written `time` on that frame; a `time` differing from the last resolved value is a direct write and re-anchors there (a seek, also while playing — so a tween on `time` scrubs); a track seen paused drops its anchor. So direct writes mean exactly what the ops mean, on the frame they land. Ops: `play` (instantiate with `time: from`, then `resume`), `pause` (freeze at the live cursor), `resume` (continue from the current `time`), `seek(t)` (jump; keeps `playing`), `stop` (`playing: false`, `time: 0`).
- **Adapter resync rule.** Between two observed frames `n` frames apart (n ≥ 1; skipped frames from player catch-up or sparse export sampling included), a track is continuous iff `playing` is unchanged and `|time − (prev.time + (playing ? n / frameRate : 0))| ≤ 1e-6 s`. Anything else is a discontinuity (seek, pause, resume, stop, direct write) to resync to. Exact equality is wrong: continuous playback misses `prev + 1/fps` by float noise (~1e-15 s) on a large share of frames. Core ships this as `Audio.isContinuous(prev, next, n, frameRate)` with `Audio.cursorTolerance = 1e-6` so both adapters use one rule; the tolerance is below one sample at any audio rate.
- **Deviation from the task note** (which suggested advancing `time` in a `Scene.background` fiber): a background is interrupted as soon as the body ends, before it can write the final frame, and its write order against other fibers within a frame is arbitrary. Deriving the cursor in the Runner (one anchor map, resolved on read and snapshot) removes both problems and needs no fiber. This is the only Runner change.

### D5. `play` never blocks; a clip ends on its frame
`play` returns the instance immediately; playing alone holds nothing. With `duration` the play is a **clip**:
- **End.** The track pauses on frame `start + round(duration × fps)`, decided by the Runner (the anchor carries the end frame), not by a fiber — so the end holds even when `play` ran inside a `Scene.all` branch or a fork that has since been cut. Zero duration pauses on the start frame. `loop` is kept; the end is on the unwrapped cursor.
- **Hold.** `play` also forks a `Scene.sleep(duration)`, so the clip holds the scene open exactly like a `Scene.fork` started at that point: from the scene body (or any branch alive that long) the scene cannot end before the clip. A fork owned by a shorter-lived branch is cut with that branch — existing `Scene.fork` ownership, deliberately unchanged — and then the rest of the scene sets the length; the clip end itself is unaffected. The hold is scene time and ignores transport.
- **Precedence.** Any later explicit command (`pause`, `resume`, `seek`, `stop`) or direct transport write restarts the anchor without an end: user-directed playback is never cut by an earlier clip. To bound it again, `play` a new clip.

`Audio.duration(track)` returns a `Duration` (metadata stores seconds), so it feeds `Scene.sleep` and the `duration` option directly — a bare number would be read as milliseconds. Remaining source length is the author's arithmetic from the explicit query (`Duration.subtract(duration, Duration.seconds(from))`); a looped track has no natural end, so it plays until paused, stopped, a clip ends, or the scene ends. Authors wait explicitly: `yield* Scene.sleep(yield* Audio.duration(track))`.

### D6. One instance tree
Audio instances are born mounted under the ambient parent like any instance (root, a Group, or a `Scene.play` mount), and appear in `frame.instances`. A track is **audible** iff `playing` and reachable from `frame.root` through `children`; nested scenes are reachable through their mount group. A detached track (`Scene.removeChild`) is silent but its cursor keeps advancing; re-attaching makes it audible at the live cursor. At scene end every track stops; there is no audio tail past the last frame.

### D7. Animator shapes and the naming exception
- `fade`/`fadeTo` are the base/To pair over `Motion.tween`/`tweenTo` on `gain`, dual, gated to `Instance<"Audio">`, exact on the final frame.
- `fadeIn(d)` = `fade(0, 1, d)`, `fadeOut(d)` = `fadeTo(0, d)`, `crossfade(from, to, d)` = both at once, resolving with `to`. These name their endpoints in the verb, so — like the recorded `Camera.lookAt` exception — they have no base/To pair; other endpoints use `fade`/`fadeTo`. `fadeOut` changes only gain; it does not pause.
- `crossfade` takes two instances, so its dual dispatches on `Instance.isInstance(args[1])` (still a type guard, never arity).
- `pause`/`resume`/`stop` take one argument and accept an instance or instance-effect, so they are already pipeable (`track.pipe(Audio.pause)`); `seek` is dual on the first argument. `play` creates the instance from a reference (not an animator), so it is data-first only.

### D8. Renderer
`Audio` gets a no-op retained renderer (an empty `Object3D`) in the exhaustive builtin map. The frame walk reaches mounted audio like any leaf; nothing draws.

## Contract for the adapters (browser playback, export)

- Byte loading: `AudioLoader<id>` from frame data via `Audio.Loader(ref.id)`; metadata the same way via `Audio.Metadata(ref.id)` when an adapter needs it.
- Per frame: walk from `root` through `children` (and comps) to find audible tracks; read `time`, `gain`, `loop`, `playing`. Gain is linear, per frame (step or ramp across the frame interval — adapter choice, same value at frame boundaries).
- Wrap `time` by the decoded source duration when `loop`; silence past the end otherwise.
- Resync with `Audio.isContinuous(prev, next, elapsedFrames, frameRate)` (D4) — never exact float equality, and count skipped frames; stop everything at stream end.
