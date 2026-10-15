# video-encoding Specification (delta)

## MODIFIED Requirements

### Requirement: A scene renders to a video file in one call
`Video.render(scene, outPath, options?)` SHALL compose the scene frame stream, the Node renderer, and ffmpeg video encoding. For each frame it SHALL record reachable Audio instances by instance id, asset id, unwrapped source time, playing state, loop, and gain. If any reachable instance plays, it SHALL decode each referenced asset's loader bytes to fixed-rate stereo float PCM, mix one frame-aligned sample span at a time, and mux AAC into the MP4 while copying the encoded video. Source position SHALL use the frame's time, wrap at source duration only for loops, and produce silence after a non-looping source ends. Each instance SHALL mix independently, including simultaneous uses of one asset. Gain SHALL be nonnegative and linearly interpolated from the preceding continuous frame. A paused, stopped, detached, or ended instance SHALL be silent. Audio SHALL end with the video frame stream. A scene with no playing Audio entries SHALL take the original video-only encoding path and have no audio stream.

`Video.prepareAudio(track, load)` SHALL provide the loader and immutable duration metadata from one load of the same bytes, measured before frame generation by the Node audio decoder. A duration-driven scene SHALL retain its metadata requirement through `Video.render`; providing only loader bytes SHALL fail to typecheck. The Node process and filesystem services SHALL be provided by the caller or the CLI's platform layer. Audio decoding, mixing, and muxing errors SHALL surface as `EncodeError`; ffmpeg failures SHALL carry captured stderr.

#### Scenario: End-to-end scene to MP4
- **WHEN** `Video.render(scene, "out.mp4")` runs for a finite scene with ffmpeg available
- **THEN** a playable MP4 exists at `out.mp4` whose frame count matches the scene's frames and whose framerate matches the scene's frame metadata

#### Scenario: The renderer is provided internally
- **WHEN** `Video.render` runs
- **THEN** it acquires the renderer and GPU device itself and the caller supplies no renderer layer

#### Scenario: Audio stream matches the frame stream
- **WHEN** a finite scene plays a mounted track and renders at a given frame rate
- **THEN** ffprobe finds one video and one AAC audio stream, and the audio duration matches the count of video frame spans within codec tolerance

#### Scenario: Source offset, transport, gain and loop
- **WHEN** an instance starts at a source offset, pauses, resumes, fades to zero, and loops beyond the source end
- **THEN** the mix follows its cursor and transport per frame, fades to silence at the specified frame, and wraps only while loop is true

#### Scenario: Two instances share an asset
- **WHEN** two mounted instances play the same asset at different times and gains
- **THEN** both signals are heard at their independent positions in the mix

#### Scenario: Silent video is unchanged
- **WHEN** a scene has no playing Audio entry
- **THEN** `Video.render` produces the same video-only output path and ffprobe finds no audio stream

#### Scenario: Duration is prepared from export bytes
- **WHEN** a scene queries `Audio.duration(track)` and `Video.prepareAudio(track, load)` is provided
- **THEN** the query uses the duration decoded from exactly the loader bytes and frame generation can begin; supplying only `Audio.layer(track, load)` leaves a compile-time metadata requirement

#### Scenario: ffmpeg rejects an audio source
- **WHEN** ffmpeg cannot decode an asset or mux the mixed audio
- **THEN** export fails with an `EncodeError` containing ffmpeg's stderr, and temporary PCM and MP4 files are released
