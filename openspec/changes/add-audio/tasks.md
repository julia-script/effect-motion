# Tasks: add-audio

## 1. Core resource and metadata (packages/motion)

- [x] 1.1 `Audio.ts`: `Audio.Audio`, `schema`, `Loader`, `AudioLoader`, `layer` (Image contract)
- [x] 1.2 `AudioMetadata`, `Metadata`, `duration`, `metadataLayer`, `preparedLayer`
- [x] 1.3 Type tests: reference-only scene runs with no bytes; duration query survives `Scene.run`; missing provider fails typechecking

## 2. Entity and transport

- [x] 2.1 `Audio` entity (`audio`, `time`, `gain`, `loop`, `playing`) in the closed union
- [x] 2.2 `play` (Runner-derived cursor; `duration` holds), `pause`, `resume`, `seek`, `stop`
- [x] 2.3 Tests: time advances 1/fps from `from`; loop stored; background play does not extend the scene; `duration` holds; pause/seek/stop exact on their frame; duration-derived frame counts

## 3. Gain animators

- [x] 3.1 `fade`/`fadeTo`, `fadeIn`, `fadeOut`, `crossfade`
- [x] 3.2 Tests: endpoints exact; `Motion.tweenTo({ gain })` on audio

## 4. Renderer and exports

- [x] 4.1 No-op `Audio` renderer in `Builtins.ts`
- [x] 4.2 Barrel export (`./*` subpath already covers `effect-motion/Audio`)

## 5. Verification fixes

- [x] 5.1 Clip end derived by the Runner (independent of branch lifetime); hold keeps Scene.fork ownership (D5)
- [x] 5.2 Explicit commands and direct writes cancel a pending clip end (D5)
- [x] 5.3 `Audio.isContinuous` + tolerance; 24/30/60fps continuous, skipped, seek and pause evidence (D4)
- [x] 5.4 Direct transport writes supported and documented; zero-duration and loop+clip regressions

## 6. Verify

- [x] 6.1 `bun run lint && bun run check && bun run --filter=effect-motion test && bun run --filter=@effect-motion/renderer test`

## 7. Documentation

- [x] 7.1 Audio how-to guide and permanent duration-driven docs example
- [x] 7.2 Browser playback and Node MP4 export of the same docs scene
- [x] 7.3 Generated API reference, root lint/check/test/build, and strict OpenSpec validation
