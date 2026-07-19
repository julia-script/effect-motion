# create-effect-motion Delta Specification

## ADDED Requirements

### Requirement: Scaffolding via the package-manager create convention
Project scaffolding SHALL ship as a dedicated package published unscoped as `create-effect-motion` with a `create-effect-motion` bin, so that `pnpm create effect-motion`, `npm create effect-motion`, `yarn create effect-motion`, and `bun create effect-motion` all invoke it. The package SHALL NOT depend on `@effect-motion/cli`, and its published contents SHALL be limited to the built output and the template tree.

#### Scenario: npm create resolves the scaffolder
- **WHEN** a user runs `pnpm create effect-motion`
- **THEN** the latest published `create-effect-motion` runs its interactive scaffold without downloading `@effect-motion/cli` or its dependencies

### Requirement: Interactive scaffold with directory-derived project name
The scaffolder SHALL prompt for a target directory (accepting a positional argument to skip the prompt) and a package manager. When the user enters `.`, the project SHALL be created in the current directory and named after the current directory's basename; otherwise the directory is created and its basename is the project name. A target directory that exists and is not empty (ignoring dotfiles like `.git`) SHALL abort the scaffold with an error. The package-manager prompt SHALL default to the manager that invoked the scaffolder (from `npm_config_user_agent`) when detectable.

#### Scenario: Dot means current directory
- **WHEN** the user runs the scaffolder inside `~/work/my-video` and answers `.` to the directory prompt
- **THEN** the project is scaffolded in place with `"name": "my-video"` in package.json

#### Scenario: New directory created
- **WHEN** the user answers `demo-reel`
- **THEN** `demo-reel/` is created and the project name is `demo-reel`

#### Scenario: Non-empty directory refused
- **WHEN** the target directory exists and contains files other than dotfiles
- **THEN** the scaffold aborts with an error and writes nothing

#### Scenario: Invoking manager listed first
- **WHEN** the scaffolder is invoked via `pnpm create effect-motion`
- **THEN** the package-manager prompt lists `pnpm` first so plain Enter selects it

### Requirement: Generated project structure
The scaffold SHALL produce: `src/scenes/hello-world.ts` (a simple working scene exporting `scene`), `src/main.ts` (an ordinary scene composing the scene modules via scene combinators — not a CLI-special file), `src/assets/` (empty, kept), `motion.config.ts` (registering `hello-world` and `main` as targets with `output: "./output"`), `package.json`, `tsconfig.json` (strict, matching the library's supported settings), an `AGENTS.md` teaching AI coding agents the project's authoring model (scene structure, animator conventions, determinism rules, config contract), and a `.gitignore` covering `node_modules/` and `output/`. The generated project SHALL render and preview successfully with no edits.

#### Scenario: Fresh scaffold works end to end
- **WHEN** a scaffolded project runs `motion render` after install
- **THEN** MP4 files for the registered targets appear under `output/` with exit code 0

### Requirement: Exact dependency pinning derived from the scaffolder's own release
The generated `package.json` SHALL pin exact versions (no `^`/`~`/`latest`) of `effect-motion`, `@effect-motion/react`, `@effect-motion/export`, `@effect-motion/cli`, and `effect`, derived at runtime from the scaffolder's own published `package.json` (its `version` for the lockstep packages, its `dependencies.effect` for the effect pin). `create-effect-motion` SHALL be a member of the changesets `fixed` group so its version — and therefore the derived pins — moves in lockstep with every release. After scaffolding, the scaffolder SHALL run the chosen package manager's install unless `--no-install` is passed.

#### Scenario: Effect version pinned exactly
- **WHEN** a project is scaffolded
- **THEN** its `package.json` lists an exact `effect` version equal to the pin the scaffolder release was built and tested against (seeded-random determinism depends on it)

#### Scenario: Pins current after a release with no scaffolder changes
- **WHEN** a lockstep release bumps all packages and a user then runs `pnpm create effect-motion`
- **THEN** the scaffold pins the just-released versions with no scaffolder code change or release automation involved

#### Scenario: Install skipped on request
- **WHEN** the scaffolder runs with `--no-install`
- **THEN** no install runs and the final message shows the install + studio commands for the chosen package manager

### Requirement: Optional Biome setup
The scaffolder SHALL prompt "Add Biome for linting/formatting?" defaulting to Yes, skippable via `--biome` / `--no-biome`. When selected, the scaffold SHALL additionally write a `biome.json` whose formatter settings match the template files' existing formatting (a fresh scaffold passes `biome check` with no diagnostics), add `@biomejs/biome` to `devDependencies` (range pin — not determinism-critical), and add `lint` / `lint:fix` scripts. When declined, none of these SHALL appear.

#### Scenario: Biome-enabled scaffold is check-clean
- **WHEN** a project is scaffolded with Biome selected and dependencies installed
- **THEN** `biome check .` in the project exits 0 with no diagnostics

#### Scenario: Biome declined
- **WHEN** a project is scaffolded with `--no-biome`
- **THEN** the project contains no `biome.json`, no `@biomejs/biome` dependency, and no lint scripts

### Requirement: Git initialization
After scaffolding, the scaffolder SHALL run `git init` in the project directory unless the directory is already inside a git work tree. Git being unavailable or `git init` failing SHALL NOT fail the scaffold.

#### Scenario: Fresh project gets a repository
- **WHEN** a project is scaffolded outside any git repository on a machine with git
- **THEN** the project directory is a git repository with the scaffolded `.gitignore` in place

#### Scenario: Existing repository respected
- **WHEN** a project is scaffolded inside an existing git work tree
- **THEN** no nested repository is created

### Requirement: Non-interactive operation
Every prompt SHALL have a flag twin (`directory` positional, `--pm`, `--biome`/`--no-biome`), and a `--yes` flag SHALL accept the default answer for every prompt not explicitly answered by a flag (explicit flags win over `--yes`). With all answers supplied, the scaffolder SHALL run without prompting.

#### Scenario: Fully scripted scaffold
- **WHEN** `create-effect-motion my-app --pm pnpm --no-biome --no-install` runs in CI
- **THEN** the scaffold completes with no interactive prompt

#### Scenario: Accept all defaults
- **WHEN** `create-effect-motion --yes` runs
- **THEN** the project scaffolds into `my-motion-project` with the detected package manager and Biome enabled, without prompting
