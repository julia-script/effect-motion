# video-encoding Specification

## Purpose
Encode a stream of PNG frames into a video file via a system ffmpeg, and compose the whole scene → video pipeline in one call, in the Node-only `@effect-motion/export` package. Encoding is an export tool, not a renderer: it consumes the ThorVG PNG renderer's output (`renderToPng`) and produces a shareable artifact — a stream of frames that no per-frame `render()` contract can express.
## Requirements
### Requirement: PNG stream encodes to a video file through ffmpeg
`Ffmpeg.encode(pngStream, outPath, options)` SHALL spawn an ffmpeg process and pipe the PNG frame stream into its stdin using the `image2pipe` demuxer, producing a video file at `outPath`. No intermediate frame files SHALL be written to disk. The ffmpeg binary SHALL resolve from `PATH` by default and MUST be overridable via `options.binary`. `options.frameRate` SHALL set the input framerate. Default output flags SHALL be H.264 (`libx264`), `yuv420p` pixel format, and `+faststart` MP4; `options.extraArgs` SHALL be appended to the ffmpeg invocation before the output path.

#### Scenario: Frames encode via stdin
- **WHEN** `Ffmpeg.encode` runs with a stream of PNG buffers and `frameRate: 30`
- **THEN** ffmpeg is spawned with `-f image2pipe -framerate 30 -i -` and the default output flags, the PNG bytes flow to its stdin, and the effect succeeds after ffmpeg exits 0

#### Scenario: Custom binary and extra args pass through
- **WHEN** `Ffmpeg.encode` runs with `binary: "/opt/ffmpeg/bin/ffmpeg"` and `extraArgs: ["-crf", "18"]`
- **THEN** the spawned command uses the given binary and includes `-crf 18` before the output path

### Requirement: Encoding failures are tagged errors carrying ffmpeg's diagnostics
Failures — the binary missing from `PATH`, a nonzero ffmpeg exit, or a broken pipe — SHALL surface as a tagged `EncodeError`, not a thrown exception. A nonzero-exit error MUST include ffmpeg's captured stderr; a missing-binary error MUST say that ffmpeg needs to be installed. Stderr SHALL always be consumed while the process runs.

#### Scenario: Missing ffmpeg binary
- **WHEN** `Ffmpeg.encode` runs on a system where the binary cannot be spawned
- **THEN** the effect fails with an `EncodeError` whose message states that ffmpeg must be installed and available on `PATH`

#### Scenario: ffmpeg exits nonzero
- **WHEN** the spawned ffmpeg process exits with a nonzero code
- **THEN** the effect fails with an `EncodeError` that includes the process's stderr output

### Requirement: A scene renders to a video file in one call
`Video.render(scene, outPath, options?)` SHALL compose the full pipeline: stream the scene's frames, rasterize each to PNG through the ThorVG renderer (`renderToPng`), and encode the PNGs with `Ffmpeg.encode`. The ThorVG engine SHALL be acquired internally (the Node SW layer), so callers wire no renderer. The input framerate SHALL come from the frames' render metadata, not from a caller option.

#### Scenario: End-to-end scene to MP4
- **WHEN** `Video.render(scene, "out.mp4")` runs for a finite scene with ffmpeg available
- **THEN** a playable MP4 exists at `out.mp4` whose frame count matches the scene's frames and whose framerate matches the scene's frame metadata

#### Scenario: The ThorVG engine is provided internally
- **WHEN** `Video.render` runs
- **THEN** it acquires the ThorVG engine itself and the caller supplies no renderer layer or engine

### Requirement: Odd output dimensions fail before ffmpeg is spawned
Because `yuv420p` requires even dimensions, `Video.render` SHALL inspect the first frame's metadata and fail with an `EncodeError` naming the offending dimension when width or height is odd. The error message MUST state the remedy (use even scene dimensions, or supply a scale filter via `extraArgs`). The library SHALL NOT silently resize or pad frames.

#### Scenario: Odd width rejected
- **WHEN** `Video.render` runs for a scene whose frame metadata reports width 601
- **THEN** the effect fails with an `EncodeError` naming the odd width before any ffmpeg process is spawned

### Requirement: Encoding ends when the stream ends, with an explicit frame cap available
`Video.render` SHALL close ffmpeg's stdin when the frame stream completes and resolve once ffmpeg finalizes the file. `options.frames` SHALL cap the number of encoded frames; without it, a scene that never ends produces an encode that never ends, and the option's documentation MUST state this.

#### Scenario: Frame cap truncates an infinite scene
- **WHEN** `Video.render` runs for an infinite scene with `frames: 120`
- **THEN** exactly 120 frames are encoded and the effect resolves with a finalized video file

### Requirement: A render program is runnable with documented platform provision
`@effect-motion/export` SHALL document (and verify by test) the standalone-run contract for a render entrypoint: `Video.render`'s only leftover platform requirement is the process spawner, satisfiable by providing the Node platform services (e.g. `NodeServices` from `@effect/platform-node`), so a `render.ts` is executable directly (e.g. via `tsx`) without the CLI. The scene's resource loaders remain the caller's requirement, provided in the same pipe. `Video.render` SHALL create the output path's parent directory (recursively) before encoding, so render programs carry no mkdir boilerplate.

#### Scenario: Standalone render.ts runs without the CLI
- **WHEN** a render program pipes `Video.render(...)` through `Effect.provide` of its loader layers and the Node platform services and is executed directly
- **THEN** the output video is produced identically to running it through `motion render`

#### Scenario: Output directory is created
- **WHEN** `Video.render(scene, "fresh/dir/out.mp4")` runs and `fresh/dir` does not exist
- **THEN** the directory is created and the video is written

