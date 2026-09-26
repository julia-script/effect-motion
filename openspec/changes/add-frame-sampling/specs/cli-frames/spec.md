# cli-frames Specification (delta)

## ADDED Requirements

### Requirement: Frame selection syntax
A frame selection SHALL be either a comma-separated list of selectors — a non-negative integer frame index (`30`), a time in seconds or milliseconds (`1.5s`, `500ms`), a percentage 0–100 of the scene (`50%`), or `end` (the last frame) — or `count N` (N ≥ 1) for N evenly spaced frames including the first and the last; N larger than the scene's frame count SHALL clamp to every frame once. A time maps to frame `round(seconds × frameRate)`; frame `i` is at time `i / frameRate`. Sampled frames SHALL be returned in the requested order. Any other input SHALL fail with an error naming the invalid value.

#### Scenario: Mixed selectors
- **WHEN** a 31-frame scene at 30fps is sampled with `0,500ms,1s,50%,end`
- **THEN** the sampled frames are 0, 15, 30, 15, 30 in that order

#### Scenario: Evenly spaced count
- **WHEN** a 31-frame scene is sampled with `count 3`
- **THEN** the sampled frames are 0, 15 and 30

#### Scenario: Count past the scene length
- **WHEN** a 31-frame scene is sampled with `count 100`
- **THEN** the sampled frames are 0 through 30, each once

#### Scenario: Invalid selector
- **WHEN** the selection is `abc`
- **THEN** sampling fails with an error naming `abc` and the accepted forms

### Requirement: Length-dependent selection
Only `%`, `end` and `count` SHALL require the scene length, computed by running the scene without rendering. A frame past the scene's end SHALL fail with an error naming the frame (and the selector it came from) and the scene length. For a scene with `maxFrames: Infinity`, a selection needing its end SHALL fail with an error saying the scene is infinite, while index and time selections still sample.

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
Sampled frames SHALL render headlessly to PNG stills at the scene's size, and optionally to a single contact-sheet PNG laying the frames out in a grid (e.g. 9 frames → 3×3), reporting which frame and time each tile shows. Pixel output is not guaranteed bit-exact across machines.

#### Scenario: Contact sheet grid
- **WHEN** 9 frames are sampled into a contact sheet
- **THEN** one PNG is written with a 3×3 grid and tile → frame/time is reported

### Requirement: motion frames command
`motion frames <scene>` SHALL sample a scene registered in the project's `studio.ts` by key, with `--at <selection>` or `--count N`, writing PNG stills (printing their paths), a contact sheet with `--sheet` (printing tile → frame/time), and/or JSON with `--json <path|->` (`-` = stdout). Stills are the default output; `--sheet` writes the sheet instead of stills, and `--json` alone writes no PNGs and SHALL NOT load the GPU renderer. With neither `--at` nor `--count`, six evenly spaced frames are sampled. With no scene it SHALL print the available scene keys; with an unknown scene it SHALL fail listing them. Errors SHALL render through the CLI error path and exit non-zero.

#### Scenario: Stills at chosen points
- **WHEN** `motion frames intro --at 0,1s,end` runs
- **THEN** three PNGs of the scene's size are written and their paths printed

#### Scenario: JSON to stdout
- **WHEN** `motion frames intro --at 50% --json -` runs
- **THEN** valid JSON with the frame index, time and every entity's data is printed

#### Scenario: Unknown scene lists keys
- **WHEN** `motion frames nope` runs
- **THEN** the command exits non-zero listing the scene keys from `studio.ts`
