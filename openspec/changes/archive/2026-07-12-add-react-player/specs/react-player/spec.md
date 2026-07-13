## ADDED Requirements

### Requirement: usePlayer hook prepares a scene for playback
The `@effect-motion/react` package SHALL provide a `usePlayer` hook that accepts a scene (and optional settings: `seed`, `frameRate`, `width`, `height`) and collects the scene's frames by running it to completion. The hook SHALL expose a `status` of `'loading'` while collecting, `'ready'` when frames are available, and `'error'` (with the error value) if the scene fails.

#### Scenario: Frames collected on mount
- **WHEN** a component using `usePlayer(scene)` mounts
- **THEN** the scene is run to completion once and `status` transitions from `'loading'` to `'ready'` with `totalFrames > 0`

#### Scenario: Failing scene surfaces as error state
- **WHEN** the scene's effect fails during collection
- **THEN** `status` is `'error'` and the error value is exposed, without throwing during render

#### Scenario: Collection is cancelled on unmount
- **WHEN** the component unmounts while `status` is `'loading'`
- **THEN** the running collection is interrupted and no state updates occur afterwards

### Requirement: Playback controls
`usePlayer` SHALL expose playback state — `playing`, `frame` (current index), `totalFrames`, `progress` (0..1) — and controls: `play()`, `pause()`, `toggle()`, and `seek(frame)`. While playing, the current frame SHALL advance at the scene's frame rate and playback SHALL pause automatically at the last frame.

#### Scenario: Play advances frames
- **WHEN** `play()` is called on a ready player
- **THEN** `frame` advances over time at the configured frame rate and `progress` grows toward 1

#### Scenario: Pause freezes the current frame
- **WHEN** `pause()` is called during playback
- **THEN** `frame` stops advancing and the rendered output stays on the current frame

#### Scenario: Seek jumps to an arbitrary frame
- **WHEN** `seek(n)` is called with any valid frame index, in either direction
- **THEN** `frame` becomes `n` (clamped to `[0, totalFrames - 1]`) and the viewport shows that frame

#### Scenario: Playback completes
- **WHEN** the last frame is reached during playback
- **THEN** `playing` becomes `false` and `progress` is 1

#### Scenario: Replay after completion
- **WHEN** `play()` is called while the player sits on the last frame
- **THEN** playback restarts from frame 0

### Requirement: Player component renders scene with transport controls
The package SHALL provide a `<Player>` component that takes a scene (plus optional `width`, `height`, `seed`, `frameRate`, `autoPlay`) and renders: an SVG viewport showing the current frame, a play/pause toggle button, and a determinate, scrubbable progress bar reflecting `progress`. Frames SHALL be rendered using the library's existing SVG DOM renderer.

#### Scenario: Scene renders in the viewport
- **WHEN** `<Player scene={scene} />` finishes loading
- **THEN** the first frame's SVG output is present in the DOM

#### Scenario: Play/pause button toggles playback
- **WHEN** the user clicks the play/pause button
- **THEN** playback starts if paused, and pauses if playing, with the button reflecting the new state

#### Scenario: Progress bar scrubbing seeks
- **WHEN** the user drags the progress bar to a position
- **THEN** the player seeks to the corresponding frame and the viewport updates
