# Design: add-ffmpeg-encoder

## Context

The export pipeline is streams end to end: `Scene.stream` yields `Frame`s, the SVG string sink renders each to a document string, `Resvg.rasterize` turns each string into PNG bytes. Every stage upstream of video already exists and is specced (`svg-rendering`, `resvg-rasterization`, `font-loading`, `frame-metadata`). The missing stage — PNGs → video — is inherently stream-shaped: ffmpeg consumes a *sequence* of frames, which is exactly why the resvg design placed encoding in export tools rather than the per-frame `Renderer` contract.

Two platform facts shape the design:

- `effect/unstable/process/ChildProcess` (in the pinned `effect` 4.0.0-beta.94) spawns processes through a `ChildProcessSpawner` service, and its `stdin` option accepts a `Stream<Uint8Array>` directly. `@effect/platform-node` provides `NodeChildProcessSpawner`.
- ffmpeg's `image2pipe` demuxer accepts concatenated PNGs on stdin, so no frame ever touches disk.

`FrameMeta` carries `frameRate`, `width`, `height` on every frame, and the export package's `Fonts` helper already maps the scene's font annotation to resvg `fontFiles`.

## Goals / Non-Goals

**Goals:**

- A stream-in, file-out ffmpeg wrapper at the same altitude as `Resvg`: tool in, tagged error out, platform services consumer-provided.
- A one-call `Video.render(scene, outPath, options?)` that fulfills the roadmap's done-when: a real video file from a scene, fonts included, frame rate from metadata.
- Defaults that produce a file QuickTime and browsers play without flags.

**Non-Goals:**

- Bundling ffmpeg. It is a documented system requirement.
- Audio (Later on the roadmap; it is a muxing concern in this same stage when it comes).
- Container/codec matrix (GIF, WebM, ProRes), numbered PNG-sequence output, progress reporting.

## Decisions

### System ffmpeg over bundled

Spawn `ffmpeg` from `PATH`, overridable per call (`binary` option). `ffmpeg-static` adds an ~80 MB platform binary to every install; wasm ffmpeg is slow and memory-capped — wrong for video. This is a Node-only dev tool; a missing binary fails as a tagged `EncodeError` whose message says how to install ffmpeg. The option doubles as the escape hatch for pinned/custom builds.

### Stdin piping over temp PNG sequences

`Ffmpeg.encode` passes the PNG stream as the child's `stdin` with `-f image2pipe -framerate <n> -i -`. No temp dir, no numbering scheme, no cleanup, and backpressure comes free from the pipe. A numbered-sequence exporter can be a later change if someone needs the intermediate artifacts.

### Two API layers, one change

- `Ffmpeg.encode(pngStream, outPath, { frameRate, binary?, extraArgs? })` — the tool wrapper, mirroring `Resvg`'s altitude. Requires `ChildProcessSpawner`.
- `Video.render(scene, outPath, options?)` — the composition: `Scene.stream` → string-sink render → `Fonts` annotation → resvg `fontFiles` → `Resvg.rasterize` → `Ffmpeg.encode`. Frame rate and dimensions are read from the first frame's `FrameMeta`; the caller never repeats what the scene already knows.

The wrapper alone would leave the roadmap's done-when unmet; the composition alone would bury a reusable tool. Both are small.

### Defaults: H.264 / yuv420p / +faststart MP4, `extraArgs` as the only knob

`-c:v libx264 -pix_fmt yuv420p -movflags +faststart` is the broadest-compatibility default. `extraArgs` is appended before the output path, letting users adjust CRF, preset, or filters without us modeling ffmpeg's surface. Modeling codecs properly is a change for when a second container is actually wanted.

### Odd dimensions fail typed, before spawning

`yuv420p` requires even width and height. A 601×400 scene would die inside ffmpeg with an inscrutable message. `Video.render` checks the first frame's metadata and fails with a `EncodeError` naming the offending dimension and the fix (resize the scene, or pass `extraArgs` with a scale filter). Silently padding or scaling frame-exact output is off-brand for the library.

### Finiteness is the scene's job, with an explicit cap available

`Video.render` takes `frames?: number` (applied as `Stream.take`). Without it, the encode ends when the scene ends — an infinite scene without a cap runs forever, and the option's doc says so. Guessing a duration on the user's behalf would be worse than the documented behavior.

### Rasterization concurrency

`Video.render` rasterizes with `Stream.mapEffect(..., { concurrency: 4 })` — resvg is CPU-bound per frame and order-preserving concurrency is free at the stream level. <!-- ponytail: fixed 4, expose an option if a real scene proves it matters -->

## Risks / Trade-offs

- [ffmpeg not installed on user machines] → tagged error with install guidance; system requirement documented on the export docs page; e2e test skips when absent.
- [`effect/unstable/process` is an unstable module] → same posture as the beta pin itself, already a tracked roadmap risk; the surface we use (spawn, stdin stream, exit code) is minimal.
- [ffmpeg exit ≠ file validity] → treat nonzero exit as failure and surface captured stderr in the error; success path asserts the output file exists.
- [Stderr buffering: ffmpeg writes progress to stderr; an ignored pipe can fill and deadlock] → collect stderr (it is also the error diagnostic), never leave it unconsumed.
- [Different ffmpeg versions/builds accept different flags] → defaults use flags stable across every maintained ffmpeg (4.x+); `extraArgs` failures surface stderr verbatim.

## Open Questions

None blocking. Audio muxing and codec/container options are deliberately deferred to their own changes.
