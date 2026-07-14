# Proposal: add-ffmpeg-encoder

## Why

The export pipeline stops at PNG bytes: `Scene.stream` → `SvgRenderer.render` → `Resvg.rasterize` produces a stream of rasterized frames, but nothing turns that stream into the artifact people actually share — a video file. This is the last stage of the v0.1 objective ("a real video file has been produced end-to-end through the export pipeline") and the reason the export package exists.

## What Changes

- **`Ffmpeg.encode(pngStream, outPath, options)`** in `@effect-motion/export`: pipes a `Stream<Uint8Array>` of PNG frames into a spawned ffmpeg process (`-f image2pipe`) and resolves when the file is written. No PNG sequence on disk, no temp files — frames flow through stdin.
- ffmpeg is a **system binary** resolved from `PATH` (overridable via `options.binary`); a missing or failing binary surfaces as a tagged `EncodeError` with an actionable message. No bundled ffmpeg dependency.
- Process spawning uses `effect/unstable/process/ChildProcess` (stdin accepts a `Stream<Uint8Array>` directly) with the consumer-provided `ChildProcessSpawner` service — the same service idiom `Resvg.rasterizeToFile` uses with `FileSystem`.
- **`Video.render(scene, outPath, options?)`**: the composed end-to-end helper — streams the scene, renders each frame through the SVG string sink, maps the scene's `Fonts` annotation to resvg `fontFiles`, rasterizes, and encodes. Frame rate is read from the scene's frame metadata, never repeated by the caller.
- Defaults produce a broadly playable file: H.264 (`libx264`), `yuv420p`, `+faststart` MP4. An `extraArgs` passthrough is the only codec surface; other containers/codecs are out of scope.
- Odd output dimensions (invalid for `yuv420p`) **fail typed with a clear message** before ffmpeg is spawned — no silent resizing of frame-exact output.
- Infinite scenes: `Video.render` accepts an optional `frames` cap; without it, the scene ending is what ends the encode. Documented, not guessed.
- Out of scope: audio (Later on the roadmap), GIF/WebM/ProRes, numbered PNG-sequence export, progress UI.

## Capabilities

### New Capabilities

- `video-encoding`: encoding a stream of PNG frames into a video file via a system ffmpeg, and the end-to-end scene → video composition.

### Modified Capabilities

None. `resvg-rasterization`, `svg-rendering`, `font-loading`, and `frame-metadata` are consumed as-is.

## Impact

- `packages/export`: new `Ffmpeg.ts` and `Video.ts` modules, exported from the index. No new npm dependencies — `effect/unstable/process` ships in the pinned `effect` beta, and ffmpeg is a runtime system requirement (documented).
- `effect-motion` core and `@effect-motion/react`: untouched.
- Docs: the export example gains the one-call video path; the ffmpeg system requirement is documented.
- Tests: encode-level tests run against a mock `ChildProcessSpawner`; one gated end-to-end test produces a real MP4 when ffmpeg is present (skips otherwise).
