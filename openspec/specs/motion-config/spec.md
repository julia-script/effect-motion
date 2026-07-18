# motion-config Specification

## Purpose
The motion.config.ts contract: the typed defineConfig helper, target shape (scene module, settings including dpr, output directory with derived filenames), config discovery, and Vite-based loading of user TypeScript.

## Requirements

### Requirement: Typed TypeScript config with defineConfig
The CLI SHALL define a `motion.config.ts` contract: the config module default-exports the result of a `defineConfig` helper exported by `@effect-motion/cli`. `defineConfig` SHALL be an identity function whose parameter type fully types the config, so user configs typecheck without extra annotations.

#### Scenario: Config typechecks via defineConfig
- **WHEN** a project's `motion.config.ts` calls `defineConfig` with a valid config object
- **THEN** the module typechecks under the scaffolded strict tsconfig, and the CLI receives the object unchanged at load time

#### Scenario: Invalid config shape is a load error
- **WHEN** a config's default export is missing or is not a config object (e.g. no `targets` array)
- **THEN** config loading fails with an error naming the config file path and the problem

### Requirement: Target shape with settings-scoped dpr and directory output
A config SHALL declare a `targets` array. Each target SHALL have: a unique `name` (string), a `scene` path to a module whose `scene` export is the scene to render, an optional `settings` object (subset of the Runner's `Settings` — `width`, `height`, `frameRate`, `seed`, `maxFrames`, `backgroundColor` — plus `dpr`), an optional `output` directory path (default `./output`), an optional `format` (v1: `"mp4"`, the default), and an optional `frames` cap. The output file path SHALL be derived as `<output>/<name>.<format>`; targets MUST NOT specify an output filename.

#### Scenario: dpr accepted inside settings
- **WHEN** a target declares `settings: { width: 1920, height: 1080, dpr: 2 }`
- **THEN** the config loads, and rendering that target supersamples at 2× while the scene keeps its authored logical coordinates

#### Scenario: Output path derived from name and format
- **WHEN** a target named `intro` declares `output: "./renders"` and no `format`
- **THEN** rendering that target writes `./renders/intro.mp4` (directory created if missing)

#### Scenario: Duplicate target names rejected
- **WHEN** two targets share the same `name`
- **THEN** config loading fails with an error naming the duplicate

### Requirement: Config discovery and Vite-based loading
The CLI SHALL resolve the config as: an explicit `--config <path>` flag, else the nearest `motion.config.ts` walking up from the working directory. All user TypeScript (config and scene modules) SHALL be loaded through the same Vite-based pipeline in every command, so studio and render resolve an identical module graph.

#### Scenario: Nearest config found from a subdirectory
- **WHEN** `motion render` runs in `src/scenes/` of a project whose root has `motion.config.ts`
- **THEN** that config is used

#### Scenario: Explicit config path wins
- **WHEN** `--config ../shared/motion.config.ts` is passed
- **THEN** that file is loaded and cwd-relative discovery is skipped

#### Scenario: No config and no scene argument
- **WHEN** a command requiring a config finds none and no scene file was given
- **THEN** the CLI exits non-zero with a message explaining both options (create `motion.config.ts` or pass a scene path)
