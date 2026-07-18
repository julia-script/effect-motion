## ADDED Requirements

### Requirement: Interactive scaffold with directory-derived project name
`motion init` SHALL prompt for a target directory (accepting a positional argument to skip the prompt) and a package manager. When the user enters `.`, the project SHALL be created in the current directory and named after the current directory's basename; otherwise the directory is created and its basename is the project name. A target directory that exists and is not empty (ignoring dotfiles like `.git`) SHALL abort the scaffold with an error.

#### Scenario: Dot means current directory
- **WHEN** the user runs `motion init` inside `~/work/my-video` and answers `.` to the directory prompt
- **THEN** the project is scaffolded in place with `"name": "my-video"` in package.json

#### Scenario: New directory created
- **WHEN** the user answers `demo-reel`
- **THEN** `demo-reel/` is created and the project name is `demo-reel`

#### Scenario: Non-empty directory refused
- **WHEN** the target directory exists and contains files other than dotfiles
- **THEN** init aborts with an error and writes nothing

### Requirement: Generated project structure
The scaffold SHALL produce: `src/scenes/hello-world.ts` (a simple working scene exporting `scene`), `src/main.ts` (an ordinary scene composing the scene modules via scene combinators — not a CLI-special file), `src/assets/` (empty, kept), `motion.config.ts` (registering `hello-world` and `main` as targets with `output: "./output"`), `package.json`, `tsconfig.json` (strict, matching the library's supported settings), an `AGENTS.md` teaching AI coding agents the project's authoring model (scene structure, animator conventions, determinism rules, config contract), and a `.gitignore` covering `node_modules/` and `output/`. The generated project SHALL render and preview successfully with no edits.

#### Scenario: Fresh scaffold works end to end
- **WHEN** a scaffolded project runs `motion render` after install
- **THEN** MP4 files for the registered targets appear under `output/` with exit code 0

### Requirement: Exact dependency pinning
The generated `package.json` SHALL pin exact versions (no `^`/`~`/`latest`) of `effect-motion`, `@effect-motion/react`, `@effect-motion/export`, and `effect`, using the version set the installed CLI release was built and tested against. After scaffolding, the CLI SHALL run the chosen package manager's install unless `--no-install` is passed, and the package-manager prompt SHALL default to the manager that invoked the CLI (from `npm_config_user_agent`) when detectable.

#### Scenario: Effect version pinned exactly
- **WHEN** a project is scaffolded
- **THEN** its `package.json` lists an exact `effect` version equal to the CLI's tested pin (seeded-random determinism depends on it)

#### Scenario: Install skipped on request
- **WHEN** `motion init --no-install` completes
- **THEN** no install runs and the final message shows the install + studio commands for the chosen package manager
