# video-encoding Delta Specification

## MODIFIED Requirements

### Requirement: A scene renders to a video file in one call
`Video.render(scene, outPath, options?)` SHALL compose the full pipeline: stream the scene's frames, render each through `@effect-motion/renderer`'s Node adapter (Dawn via `@effect-motion/three/node`) with GPU readback, PNG-encode the readback, and encode the PNGs with `Ffmpeg.encode`. The renderer SHALL be acquired internally, so callers wire no renderer. The input framerate SHALL come from the frames' render metadata, not from a caller option.

#### Scenario: End-to-end scene to MP4
- **WHEN** `Video.render(scene, "out.mp4")` runs for a finite scene with ffmpeg available
- **THEN** a playable MP4 exists at `out.mp4` whose frame count matches the scene's frames and whose framerate matches the scene's frame metadata

#### Scenario: The renderer is provided internally
- **WHEN** `Video.render` runs
- **THEN** it acquires the renderer and GPU device itself and the caller supplies no renderer layer
