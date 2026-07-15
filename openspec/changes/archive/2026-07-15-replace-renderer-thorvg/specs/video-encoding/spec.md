## MODIFIED Requirements

### Requirement: A scene renders to a video file in one call

`Video.render(scene, outPath, options?)` SHALL compose the full pipeline: stream the scene's frames, render each through the ThorVG software backend to a pixel buffer, and encode the buffers with `Ffmpeg.encode`. The input framerate SHALL come from the frames' render metadata, not from a caller option. Fonts declared via the scene's `Fonts` annotation SHALL be registered with ThorVG's rasterizer, so exported frames use the same families — and the same font engine — the player displays. Entity renderers SHALL require no export-specific setup. No intermediate SVG string or PNG file SHALL be produced.

#### Scenario: End-to-end scene to MP4

- **WHEN** `Video.render(scene, "out.mp4")` runs for a finite scene with ffmpeg available
- **THEN** a playable MP4 exists at `out.mp4` whose frame count matches the scene's frames and whose framerate matches the scene's frame metadata

#### Scenario: Scene fonts reach the rasterizer

- **WHEN** the scene declares a `Fonts` annotation entry with a `path` source
- **THEN** every rasterized frame uses that font through ThorVG's font engine — the same engine the browser player uses

#### Scenario: No SVG or PNG intermediates

- **WHEN** a frame is exported
- **THEN** it goes ThorVG-buffer→ffmpeg with no SVG document string and no PNG file on disk
