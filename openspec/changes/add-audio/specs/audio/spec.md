# audio Specification (delta)

## ADDED Requirements

### Requirement: Byte-free audio references
`Audio.Audio(id)` SHALL take a literal id and return a yieldable constant whose `yield*` succeeds with `{ _tag, id }` and adds `AudioLoader<ID>` to the scene's requirements. `AudioLoader<ID>` SHALL carry the shared loader brand, so `Scene.run`/`Scene.stream` SHALL NOT require it and frame production SHALL succeed with no audio bytes provided. `Audio.layer(track, load)` SHALL run `load` once at layer construction.

#### Scenario: Reference-only scene runs without bytes
- **WHEN** a scene yields `Audio.Audio("theme")` and plays it, and is streamed with no audio layer
- **THEN** frames are produced, typed `Frame<AudioLoader<"theme">>`, and carry the Audio entry

### Requirement: Explicit duration query on prepared metadata
`Audio.duration(track)` SHALL return the source length as a `Duration`, read from `AudioMetadata<ID>` — an immutable `{ id, duration }` service WITHOUT the loader brand — so its requirement SHALL survive `Scene.run`/`Scene.stream`, and running such a scene without a metadata provider SHALL fail to typecheck. `Audio.metadataLayer(track, { duration })` SHALL provide already-prepared metadata, dying at construction on a non-finite or negative duration. `Audio.preparedLayer(track, load, inspect)` SHALL load bytes once and provide both the loader and metadata derived by `inspect` from those same bytes. Declaring or playing a track SHALL NOT add the metadata requirement.

#### Scenario: Missing provider fails typechecking
- **WHEN** a scene calls `Audio.duration(theme)` and is passed to `Scene.run` with no `AudioMetadata<"theme">` provided
- **THEN** the program does not typecheck; providing `Audio.metadataLayer(theme, { duration })` makes it compile

#### Scenario: Duration-derived length
- **WHEN** at 30fps a scene sleeps for `Audio.duration(theme)` with metadata `{ duration: 0.5 }`
- **THEN** the scene's frame count is the same as sleeping `"500 millis"`

#### Scenario: Metadata tied to playback bytes
- **WHEN** `preparedLayer(theme, load, inspect)` is built
- **THEN** `load` runs once and `inspect` receives exactly the provided loader's bytes

### Requirement: Audio entity
The closed entity union SHALL include `Audio` with the transform fields plus `audio` (the reference), `time` (unwrapped playback cursor in source seconds, default 0), `gain` (linear amplitude, default 1), `loop` (default false) and `playing` (default false). It SHALL carry no opacity, scale or visibility; `Motion.fade` on an Audio instance SHALL be a compile error, while `Motion.tween`/`tweenTo` SHALL animate `gain`. Audio instances are mounted in the one instance tree like any other; a track is audible iff `playing` and reachable from the frame root.

#### Scenario: Raw tween on gain
- **WHEN** `Motion.tweenTo(track, { gain: 0.25 }, "1 second")` runs at 30fps
- **THEN** the final frame carries `gain` exactly `0.25`

### Requirement: Transport
`Audio.play(track, { from, gain, loop, duration })` SHALL create a playing Audio instance with `time = from` and return it without waiting. While playing, `time` on each frame — the scene's last included — SHALL be exactly the anchor time plus elapsed frames divided by the frame rate. Playing SHALL NOT hold the scene open; with `duration`, the play SHALL hold the scene for that scene time and then pause. `pause`, `resume`, `seek` and `stop` SHALL act on the instance and be visible on the frame they run: pause freezes the cursor, resume continues from the current `time`, seek jumps (keeping `playing`), stop sets `playing: false` and `time: 0`.

#### Scenario: Cursor advances one frame period per frame
- **WHEN** `Audio.play(theme, { from: 2 })` runs at 30fps
- **THEN** frame `i` after the play carries `time` equal to `2 + i / 30` and `playing: true`

#### Scenario: Background play does not extend the scene
- **WHEN** a scene plays a track and then sleeps 10 frames
- **THEN** the scene's length is that of the sleep alone

#### Scenario: Duration holds the scene
- **WHEN** a scene body only runs `Audio.play(theme, { duration: "1 second" })` at 30fps
- **THEN** the scene lasts one second and the last frame has `playing: false`

#### Scenario: Pause and seek
- **WHEN** a playing track is paused on frame k and sought to 5 on frame m
- **THEN** frames k..m−1 carry the same `time` with `playing: false`, and frame m carries `time` 5

### Requirement: Gain animators
`Audio.fade(from, to, d)`/`Audio.fadeTo(to, d)` SHALL be a base/To pair over `gain`, dual, gated to Audio instances, landing exactly on target on the final frame. `Audio.fadeIn(d)` SHALL fade gain 0→1, `Audio.fadeOut(d)` SHALL fade from the current gain to 0, and `Audio.crossfade(from, to, d)` SHALL run both concurrently and resolve with `to`. These three name their endpoints and have no base/To pairs (recorded exception).

#### Scenario: Crossfade endpoints
- **WHEN** `Audio.crossfade(a, b, "1 second")` runs
- **THEN** on its final frame `a.gain` is exactly 0 and `b.gain` exactly 1, and on its first frame they are strictly between their endpoints
