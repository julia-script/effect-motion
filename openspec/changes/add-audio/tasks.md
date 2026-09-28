# Tasks: add-audio

## 1. Core resource and metadata (packages/motion)

- [ ] 1.1 `Audio.ts`: `Audio.Audio`, `schema`, `Loader`, `AudioLoader`, `layer` (Image contract)
- [ ] 1.2 `AudioMetadata`, `Metadata`, `duration`, `metadataLayer`, `preparedLayer`
- [ ] 1.3 Type tests: reference-only scene runs with no bytes; duration query survives `Scene.run`; missing provider fails typechecking

## 2. Entity and transport

- [ ] 2.1 `Audio` entity (`audio`, `time`, `gain`, `loop`, `playing`) in the closed union
- [ ] 2.2 `play` (background advancer; `duration` holds), `pause`, `resume`, `seek`, `stop`
- [ ] 2.3 Tests: time advances 1/fps from `from`; loop stored; background play does not extend the scene; `duration` holds; pause/seek/stop exact on their frame; duration-derived frame counts

## 3. Gain animators

- [ ] 3.1 `fade`/`fadeTo`, `fadeIn`, `fadeOut`, `crossfade`
- [ ] 3.2 Tests: endpoints exact; `Motion.tweenTo({ gain })` on audio

## 4. Renderer and exports

- [ ] 4.1 No-op `Audio` renderer in `Builtins.ts`
- [ ] 4.2 Barrel export (`./*` subpath already covers `effect-motion/Audio`)

## 5. Verify

- [ ] 5.1 `bun run lint && bun run check && bun run --filter=effect-motion test && bun run --filter=@effect-motion/renderer test`
