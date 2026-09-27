# cli-frames Specification (delta)

## ADDED Requirements

### Requirement: Frame selection syntax
A frame selection SHALL be either a comma-separated list of selectors — a non-negative integer frame index (`30`), a time in seconds or milliseconds (`1.5s`, `500ms`), a percentage 0–100 of the scene (`50%`), or `end` (the last frame) — or `count N` (N ≥ 1) for N evenly spaced frames including the first and the last, optionally followed by a range `FROM..TO` of two selectors (`count 5 7.5s..8.5s`) that spaces the N frames over that span, both ends included; N larger than the scene's (or range's) frame count SHALL clamp to every frame once, and a range ending before it starts SHALL fail naming both frames. A time maps to frame `round(seconds × frameRate)`; frame `i` is at time `i / frameRate`. Sampled frames SHALL be returned in the requested order. Any other input SHALL fail with an error naming the invalid value.

#### Scenario: Mixed selectors
- **WHEN** a 31-frame scene at 30fps is sampled with `0,500ms,1s,50%,end`
- **THEN** the sampled frames are 0, 15, 30, 15, 30 in that order

#### Scenario: Evenly spaced count
- **WHEN** a 31-frame scene is sampled with `count 3`
- **THEN** the sampled frames are 0, 15 and 30

#### Scenario: Count past the scene length
- **WHEN** a 31-frame scene is sampled with `count 100`
- **THEN** the sampled frames are 0 through 30, each once

#### Scenario: Count over a range
- **WHEN** a 31-frame scene at 30fps is sampled with `count 2 500ms..end`
- **THEN** the sampled frames are 15 and 30

#### Scenario: Invalid selector
- **WHEN** the selection is `abc`
- **THEN** sampling fails with an error naming `abc` and the accepted forms

### Requirement: Length-dependent selection
Only `%`, `end` and a `count` without a range (or with a `%`/`end` range end) SHALL require the scene length, computed by running the scene without rendering. The scene's length SHALL be the number of frames its stream produces — the same frames a video render and the player show; backgrounds and tails still running after `Scene.finish` are cut at the scene's end and are never sampled. A frame past the scene's end SHALL fail with an error naming the frame (and the selector it came from) and the scene length. For a scene with `maxFrames: Infinity`, a selection needing its end SHALL fail with an error saying the scene is infinite, while index and time selections still sample.

#### Scenario: Out-of-range frame
- **WHEN** a 31-frame scene at 30fps is sampled with `2s`
- **THEN** sampling fails with a message naming frame 60 (`2s`) and that the scene has 31 frames

#### Scenario: Infinite scene
- **WHEN** a scene run with `maxFrames: Infinity` is sampled with `0,100`
- **THEN** frames 0 and 100 are returned
- **WHEN** the same scene is sampled with `end`, `50%` or `count 3`
- **THEN** sampling fails with an error saying the scene is infinite

### Requirement: JSON frame state
Each sampled frame SHALL be serializable as plain JSON carrying its frame index, its time in seconds, the scene width, height and frame rate, the camera, and every instance's data. The same scene and settings SHALL produce identical JSON across runs. Producing JSON SHALL NOT require the GPU renderer.

#### Scenario: Deterministic JSON
- **WHEN** the same scene is sampled twice with the same selection and settings
- **THEN** the two JSON outputs are byte-identical

### Requirement: Stills and contact sheet
Sampled frames SHALL render headlessly to PNG stills at the scene's size, and optionally to a single contact-sheet PNG laying the frames out in a grid (e.g. 9 frames → 3×3), reporting which frame and time each tile shows. Rendering SHALL require the frames' font and image loaders in context (a compile-time requirement on the stills API). Releasing the renderer SHALL release the GPU device, so a program using the stills API directly exits on its own. Pixel output is not guaranteed bit-exact across machines.

#### Scenario: Contact sheet grid
- **WHEN** 9 frames are sampled into a contact sheet
- **THEN** one PNG is written with a 3×3 grid and tile → frame/time is reported

### Requirement: motion frames command
`motion frames <scene>` SHALL sample a scene registered in the project's `studio.ts` by key, with `--at <selection>` or `--count N` (optionally spread over `--range FROM..TO`), writing PNG stills (printing their paths), a contact sheet with `--sheet` (printing tile → frame/time), and/or JSON with `--json <path|->` (`-` = stdout). Stills are the default output; `--sheet` writes the sheet instead of stills, and `--json` alone writes no PNGs and SHALL NOT load the GPU renderer. With neither `--at` nor `--count`, six evenly spaced frames are sampled. The studio's `layers` SHALL be provided to sampling and to stills/sheet rendering alike. Contact-sheet tiles SHALL be downscaled to at most 480 px wide by default, overridable with `--tile-width`. With no scene it SHALL print every scene key with its length in frames and seconds (`infinite` for `maxFrames: Infinity`); with an unknown scene it SHALL fail listing the keys. Errors SHALL render through the CLI error path and exit non-zero.

#### Scenario: Stills at chosen points
- **WHEN** `motion frames intro --at 0,1s,end` runs
- **THEN** three PNGs of the scene's size are written and their paths printed

#### Scenario: JSON to stdout
- **WHEN** `motion frames intro --at 50% --json -` runs
- **THEN** valid JSON with the frame index, time and every entity's data is printed

#### Scenario: Scene with custom fonts and images
- **WHEN** `motion frames intro --sheet` runs on a scene using a custom font and an image provided by the studio's `layers`
- **THEN** the sheet renders with them instead of failing on a missing loader

#### Scenario: Default tile width
- **WHEN** 9 frames of a 1920×1080 scene are written as a sheet with default flags
- **THEN** each tile is 480×270

#### Scenario: Listing scenes
- **WHEN** `motion frames` runs with no scene
- **THEN** each scene key is printed with its frame count and duration in seconds

#### Scenario: Unknown scene lists keys
- **WHEN** `motion frames nope` runs
- **THEN** the command exits non-zero listing the scene keys from `studio.ts`
