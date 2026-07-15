## MODIFIED Requirements

### Requirement: Player component renders scene with transport controls

The package SHALL provide a `<Player>` component that takes a scene (plus optional `width`, `height`, `seed`, `frameRate`, `autoPlay`) and renders: a ThorVG canvas viewport showing the current frame, a styled control bar with an icon play/pause toggle, an icon loop toggle, a scrubbable progress bar, and a time readout derived from the frame rate (`m:ss / m:ss` when `totalFrames` is known, elapsed time only otherwise). Frames SHALL be rendered by drawing the frame's draw-list to the ThorVG canvas. Transport buttons SHALL use icon graphics (not text glyphs) with accessible labels.

#### Scenario: Scene renders in the viewport

- **WHEN** `<Player scene={scene} />` has buffered its first frame
- **THEN** that frame is drawn to the ThorVG canvas in the DOM

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
