## Why

Motion graphics without sound stop at the silent draft. Authors need to declare audio in a scene, time animation against it, and animate its level — deterministically, in the same frame-exact model as everything else — so the browser Player and video export can later play and mix it.

## What Changes

- New `Audio` resource module (`effect-motion/Audio`), the Font/Image contract: `Audio.Audio("id")` yields a `{ _tag, id }` reference and adds a phantom `AudioLoader<ID>`; `Audio.layer(track, load)` loads bytes eagerly at layer construction.
- New prepared-metadata capability, distinct from the loader brand: `AudioMetadata<ID>` (immutable `{ id, duration }`), `Audio.duration(track)` as an explicit query whose requirement survives `Scene.run`/`stream`, `Audio.metadataLayer(track, metadata)` for already-prepared data, and `Audio.preparedLayer(track, load, inspect)` that derives metadata from the same bytes it provides.
- New `Audio` entity in the closed union: `audio`, `time` (playback cursor, source seconds), `gain` (linear, default 1), `loop` (default false), `playing` (explicit transport state, default false). Transform fields only; it never paints.
- Transport as sibling functions: `Audio.play(track, { from, gain, loop, duration })`, `Audio.pause`, `Audio.resume`, `Audio.seek`, `Audio.stop`.
- Gain animators: `Audio.fade`/`fadeTo` (base/To pair over `Motion.tween` on `gain`), plus `Audio.fadeIn`, `Audio.fadeOut`, `Audio.crossfade`. `Motion.tween`/`tweenTo({ gain })` work unchanged; `Motion.fade` stays visual opacity.
- Renderer: a no-op built-in renderer entry for `Audio`, required by the exhaustive registry.

## Capabilities

### New Capabilities

- `audio`: audio entity, transport state and frame semantics, gain animators, prepared metadata and duration queries.

### Modified Capabilities

- `resource-loaders`: adds the audio kind to the resource constructors and loader brand; documents that prepared metadata services are deliberately NOT loaders.

## Impact

**`packages/motion`** — new `Audio.ts`, `Audio` entity in `Entity.ts`, barrel line. The `./*` export already covers `effect-motion/Audio`. **`packages/renderer`** — one no-op registry entry. No playback, decoding, mixing, or analysis: browser and export adapters are separate changes built on this contract.

**Determinism** — frames stay a pure function of `(scene, settings, prepared metadata)`. Reference-only scenes need no bytes and no metadata to produce frames.

## Non-goals

Playback, decoding, mixing, waveform/peak analysis, DAW export, spatial audio, effects, playback-rate/pitch, per-sample automation.
