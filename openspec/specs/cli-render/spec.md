# cli-render Specification

## Purpose
The `motion render` command: rendering targets from motion.config.ts via @effect-motion/export, target selection, flag overrides with tsc-style precedence, and configless direct-scene rendering.

## Requirements

### Requirement: Render targets from config
`motion render` with no positional arguments SHALL render every target in the resolved config via `@effect-motion/export`, writing each to its derived output path. Positional target names SHALL restrict rendering to those targets; an unknown name SHALL exit non-zero listing the known names. Targets SHALL render sequentially; a failing target SHALL NOT stop remaining targets, and the command SHALL exit non-zero with a per-target summary if any failed.

#### Scenario: All targets rendered
- **WHEN** `motion render` runs against a config with two targets
- **THEN** two MP4s exist at the derived paths and the exit code is 0

#### Scenario: Named target selection
- **WHEN** `motion render intro` runs
- **THEN** only the `intro` target renders

#### Scenario: One target fails
- **WHEN** the first of two targets fails to render
- **THEN** the second still renders, the summary reports one failure, and the exit code is non-zero

### Requirement: Flag overrides with tsc-style precedence
The command SHALL accept `--width`, `--height`, `--fps`, `--dpr`, `--seed`, `--max-frames`, `--frames`, `--out-dir`, and `--format` flags. Effective settings per target SHALL resolve as: CLI flags over target config over library defaults. When multiple targets render, a given flag applies to each of them.

#### Scenario: Flag beats config
- **WHEN** a target declares `settings: { frameRate: 60 }` and `--fps 30` is passed
- **THEN** the output video is 30 fps

#### Scenario: Config beats defaults
- **WHEN** a target declares no `frameRate` and no `--fps` is passed
- **THEN** the library default frame rate (60) is used

### Requirement: Configless direct scene rendering
`motion render <path/to/scene.ts>` SHALL render that module's `scene` export without requiring a config, using library-default settings (as overridden by flags) and writing to `<out-dir>/<scene-basename>.<format>` with `--out-dir` defaulting to `./output`.

#### Scenario: Direct scene render
- **WHEN** `motion render ./src/scenes/hello-world.ts` runs in a project with no config
- **THEN** `./output/hello-world.mp4` is produced

### Requirement: dpr maps to supersampled export
`settings.dpr` (from config or `--dpr`) SHALL be forwarded to the export pipeline's supersampling option so output pixel dimensions are the scene dimensions × dpr while authored coordinates are unchanged.

#### Scenario: dpr doubles pixel dimensions
- **WHEN** a 960×540 target renders with `dpr: 2`
- **THEN** the output video is 1920×1080
