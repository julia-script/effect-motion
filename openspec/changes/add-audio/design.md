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
- While playing, `time` on frame `k` is exactly `anchorTime + (k − anchorFrame) / frameRate` — computed, not accumulated, so there is no drift. Each transport op re-anchors at the current frame and writes `time` immediately; the per-instance advancer writes the same computed value. Result: a seek/pause/resume on frame `k` shows on frame `k` regardless of fiber order within the frame.
- Ops: `play` (instantiate with `playing: true`, `time: from`), `pause` (freeze at the current cursor), `resume` (continue from the current `time`), `seek(t)` (jump; keeps `playing`), `stop` (`playing: false`, `time: 0`). While paused, `time` is ordinary data (a tween on it scrubs); while playing, the advancer owns it and overwrites direct writes.
- Adapter rule: for a playing track, a frame whose `time` differs from `prev.time + 1/frameRate` (or a `playing` change) is a discontinuity to resync to; otherwise playback runs freely.
- ponytail: anchors live in a module-level `WeakMap` keyed by the running scene's Runner (instance ids are per run). A transport field in `Runner` itself is the upgrade if more kinds need per-instance engine state.

### D5. `play` never blocks; `duration` holds the scene
`play` returns the instance immediately. The advancer is a `Scene.background` fiber: it never holds the scene open and is cut at scene end. With `duration`, `play` also forks an awaited branch that holds the scene for `duration` of **scene** time and then pauses the track (a clip). Pausing during that window does not extend it. Remaining source length is the author's arithmetic from the explicit query (`duration(track) − from`); a looped track has no natural end, so it plays until paused, stopped, the `duration` elapses, or the scene ends. Authors wait explicitly: `yield* Scene.sleep(yield* Audio.duration(track))`.

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
- Resync on discontinuities (D4); stop everything at stream end.
