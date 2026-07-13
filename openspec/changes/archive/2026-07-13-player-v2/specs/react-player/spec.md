## MODIFIED Requirements

### Requirement: usePlayer hook prepares a scene for playback
The `@effect-motion/react` package SHALL provide a `usePlayer` hook that accepts a scene (and optional settings: `seed`, `frameRate`, `width`, `height`) and acquires frames by pulling them incrementally from the scene's stream with a read-ahead buffer, rather than running the scene to completion first. The hook SHALL expose a `status` of `'loading'` until the first frame is available, `'ready'` once at least one frame is buffered, and `'error'` (with the error value) if the scene fails. Optional `width`/`height` settings SHALL be forwarded to the runner so frames are produced at that resolution.

#### Scenario: Playback is ready before the stream completes
- **WHEN** a component using `usePlayer(scene)` mounts with a long or infinite scene
- **THEN** `status` becomes `'ready'` once the initial buffer holds frames, without waiting for the stream to end

#### Scenario: Infinite scene plays indefinitely
- **WHEN** the scene's stream never completes
- **THEN** frames continue to be pulled ahead of playback and playback continues without termination

#### Scenario: Failing scene surfaces as error state
- **WHEN** the scene's effect fails during frame production
- **THEN** `status` is `'error'` and the error value is exposed, without throwing during render

#### Scenario: Acquisition is cancelled on unmount
- **WHEN** the component unmounts while frames are still being pulled
- **THEN** the pull scope is closed, the underlying stream is interrupted, and no state updates occur afterwards

#### Scenario: Resolution settings reach the runner
- **WHEN** `usePlayer(scene, { width: 800, height: 600 })` runs
- **THEN** produced frames carry width 800 and height 600 in their metadata

### Requirement: Playback controls
`usePlayer` SHALL expose playback state — `playing`, `frame` (current index), `bufferedFrames` (count pulled so far), `totalFrames` (`null` until the stream completes, then the final count), `progress` (0..1, computed against `totalFrames` when known, else against `bufferedFrames`) — and controls: `play()`, `pause()`, `toggle()`, `seek(frame)`, and a `loop` toggle. While playing, the current frame SHALL advance at the scene's frame rate. On reaching the last frame of a completed stream, playback SHALL pause when `loop` is off and restart from frame 0 when `loop` is on.

#### Scenario: Play advances frames
- **WHEN** `play()` is called on a ready player
- **THEN** `frame` advances over time at the configured frame rate

#### Scenario: Pause freezes the current frame
- **WHEN** `pause()` is called during playback
- **THEN** `frame` stops advancing and the rendered output stays on the current frame

#### Scenario: Seek clamps to the buffered range
- **WHEN** `seek(n)` is called
- **THEN** `frame` becomes `n` clamped to `[0, bufferedFrames - 1]`, so seeking cannot outrun the buffer

#### Scenario: totalFrames resolves on stream completion
- **WHEN** a finite scene's stream completes
- **THEN** `totalFrames` transitions from `null` to the final frame count and `progress` becomes determinate

#### Scenario: Playback completes without loop
- **WHEN** the last frame of a completed stream is reached during playback and `loop` is off
- **THEN** `playing` becomes `false` and `progress` is 1

#### Scenario: Loop restarts playback
- **WHEN** the last frame of a completed stream is reached during playback and `loop` is on
- **THEN** playback continues from frame 0 without pausing

#### Scenario: Replay after completion
- **WHEN** `play()` is called while the player sits on the last frame of a completed stream
- **THEN** playback restarts from frame 0

### Requirement: Player component renders scene with transport controls
The package SHALL provide a `<Player>` component that takes a scene (plus optional `width`, `height`, `seed`, `frameRate`, `autoPlay`) and renders: an SVG viewport showing the current frame, a styled control bar with an icon play/pause toggle, an icon loop toggle, a scrubbable progress bar, and a time readout derived from the frame rate (`m:ss / m:ss` when `totalFrames` is known, elapsed time only otherwise). Frames SHALL be rendered using the library's existing SVG DOM renderer. Transport buttons SHALL use icon graphics (not text glyphs) with accessible labels.

#### Scenario: Scene renders in the viewport
- **WHEN** `<Player scene={scene} />` has buffered its first frame
- **THEN** that frame's SVG output is present in the DOM

#### Scenario: Play/pause button toggles playback
- **WHEN** the user clicks the play/pause button
- **THEN** playback starts if paused, and pauses if playing, with the button reflecting the new state

#### Scenario: Loop toggle wraps playback
- **WHEN** the user enables the loop toggle and a finite scene reaches its last frame during playback
- **THEN** playback continues from frame 0

#### Scenario: Progress bar scrubbing seeks
- **WHEN** the user drags the progress bar to a position within the buffered range
- **THEN** the player seeks to the corresponding frame and the viewport updates

#### Scenario: Time readout reflects position
- **WHEN** playback sits at frame 90 of a completed 300-frame scene at 30 fps
- **THEN** the readout shows `0:03 / 0:10`

## ADDED Requirements

### Requirement: Viewport sizing follows frame metadata
The `<Player>` SHALL fill the width of its container (like a video element) while the viewport preserves the scene's aspect ratio from the current frame's `width`/`height` metadata via CSS `aspect-ratio`. Explicit `width`/`height` props SHALL act as overrides forwarded to the runner (and therefore reflected in the metadata); the component SHALL NOT pass a size into the render config, leaving the SVG sink's metadata fallback in effect. Before the first frame arrives, the viewport SHALL reserve space from explicit props when given.

#### Scenario: Default aspect ratio comes from the scene
- **WHEN** `<Player scene={scene} />` renders a scene whose frames carry width 800 and height 600
- **THEN** the viewport displays at an 800×600 aspect ratio without any size props

#### Scenario: Props override scene resolution
- **WHEN** `<Player scene={scene} width={400} height={400} />` renders
- **THEN** frames are produced at 400×400 and the viewport shows a square aspect ratio

#### Scenario: Container width drives display size
- **WHEN** the player is placed in a container narrower or wider than the frame width
- **THEN** the player fills the container's width and the viewport keeps the scene's aspect ratio

### Requirement: Keyboard transport shortcuts
The `<Player>` root SHALL be focusable and, while focused, SHALL handle: Space to toggle play/pause, ArrowRight to step forward one frame, and ArrowLeft to step back one frame (arrow stepping pauses playback). Shortcuts SHALL be scoped to the focused player instance so multiple players on one page do not interfere.

#### Scenario: Space toggles playback
- **WHEN** the player root has focus and the user presses Space
- **THEN** playback toggles and the page does not scroll

#### Scenario: Arrow keys step frames
- **WHEN** the player root has focus during playback and the user presses ArrowRight
- **THEN** playback pauses and `frame` advances by exactly one
