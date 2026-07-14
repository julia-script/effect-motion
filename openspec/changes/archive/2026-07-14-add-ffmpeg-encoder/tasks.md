# Tasks: add-ffmpeg-encoder

## 1. Ffmpeg wrapper

- [x] 1.1 Implement `EncodeError` (tagged) and the encode options type (`frameRate`, `binary?`, `extraArgs?`) in `packages/export/src/Ffmpeg.ts`
- [x] 1.2 Implement `Ffmpeg.encode(pngStream, outPath, options)`: spawn via `effect/unstable/process/ChildProcess` with the PNG stream as stdin (`-f image2pipe -framerate <n> -i -` + default `libx264`/`yuv420p`/`+faststart` flags + `extraArgs` + outPath), stderr collected while running
- [x] 1.3 Map failures: spawn failure → `EncodeError` with install guidance; nonzero exit → `EncodeError` carrying captured stderr
- [x] 1.4 Export `Ffmpeg` module, options type, and error from the package index

## 2. Wrapper tests (mock spawner)

- [x] 2.1 Test: encode spawns ffmpeg with the expected argv (framerate, defaults, extraArgs ordering, custom binary) and pipes the PNG bytes to stdin
- [x] 2.2 Test: nonzero exit fails typed with stderr in the error; unspawnable binary fails typed with install guidance

## 3. Video composition

- [x] 3.1 Implement `Video.render(scene, outPath, options?)` in `packages/export/src/Video.ts`: `Scene.stream` → string-sink render → `Resvg.rasterize` (order-preserving concurrency 4, fonts from the `Fonts` annotation via the existing export helper) → `Ffmpeg.encode`, frame rate taken from the first frame's `FrameMeta`
- [x] 3.2 Implement the odd-dimension check on the first frame's metadata: fail with `EncodeError` naming the dimension and remedy before spawning ffmpeg
- [x] 3.3 Implement `options.frames` as a `Stream.take` cap; document that an uncapped infinite scene never finishes encoding
- [x] 3.4 Export `Video` from the package index

## 4. Composition tests

- [x] 4.1 Test (mock spawner): a small scene produces the right frame count, framerate from metadata, and font files passed through to resvg
- [x] 4.2 Test: odd-dimension scene fails typed before any spawn; `frames` cap truncates an infinite scene
- [x] 4.3 Gated end-to-end test: with real ffmpeg on PATH (skip otherwise), `Video.render` on a docs example scene produces a playable MP4 with the expected frame count (probe via `ffprobe`/ffmpeg)

## 5. Docs and verification

- [x] 5.1 Document the export-to-video path and the ffmpeg system requirement on the export docs page
- [x] 5.2 Run the full workspace test suite and confirm green; eyeball the e2e MP4 once
