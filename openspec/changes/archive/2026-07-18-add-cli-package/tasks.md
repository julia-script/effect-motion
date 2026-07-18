## 1. Package scaffolding

- [x] 1.1 Create `packages/cli` (`@effect-motion/cli`): package.json with `motion` bin, deps `effect` (workspace pin) + `@effect/platform-node` + Vite, tsconfig extending `tsconfig.base.json`, wired into pnpm workspace + Turbo `build`/`check`/`test`
- [x] 1.2 `MotionCliError` tagged error (`reason` discriminant, `message` naming the offender, optional `cause`) + top-level reporter: message to stderr, non-zero exit, cause chain under `--verbose`; unit-test wrap/report
- [x] 1.3 Command shell via `effect/unstable/cli`: root command + `init`/`studio`/`render` subcommands (`Command.make`/`withSubcommands`), `Command.run` boundary with help/version, handlers typed to fail only with `MotionCliError`, platform layers (`NodeFileSystem`/`Path`/`ChildProcessSpawner`) provided once at the entry

## 2. Config contract (motion-config)

- [x] 2.1 `defineConfig` + config types: target shape (`name`, `scene`, `settings` incl. `dpr`, `output` dir, `format`, `frames`); export from package root
- [x] 2.2 Config loader as an Effect program: `--config` flag else upward discovery of `motion.config.ts`; load via Vite server `ssrLoadModule` (server lifecycle `acquireRelease`-scoped); validate default export, unique names, required fields — failures are `MotionCliError`s naming the file and problem
- [x] 2.3 Output-path derivation helper (`<output>/<name>.<format>`, default `./output`, default `mp4`) + unit tests for discovery, validation, derivation

## 3. Render command (cli-render)

- [x] 3.1 Render flags via `Flag`/`Argument` (`--width --height --fps --dpr --seed --max-frames --frames --out-dir --format --config`, positional targets/scene) and settings merge with precedence flags > target > defaults; map `settings.dpr` → `VideoOptions.dpr`; unit-test the merge
- [x] 3.2 Target execution: load scene module via the same Vite pipeline, run `Video.render` per target sequentially (upstream `EncodeError`/`ThorvgException` wrapped into `MotionCliError`), create output dirs, per-target summary, continue-on-failure with non-zero exit
- [x] 3.3 Target-name filtering (unknown name → error listing known names) and configless positional-scene mode
- [x] 3.4 Integration test: fixture project → `render` produces MP4s at derived paths (ffprobe-checked dims/fps, reusing the export package's e2e approach); include a dpr case

## 4. Studio command (cli-studio)

- [x] 4.1 Host app inside the CLI package: React root mounting `Player`, scene picker, error panel for modules that throw or lack a `scene` export
- [x] 4.2 Vite dev server in `motion studio`: project as root, virtual entry for the host app, scene list = config targets + `src/scenes/*.ts` glob, target `settings` applied when previewing a registered scene, `--port`/`--host` passthrough
- [x] 4.3 Manual verification pass: scaffolded project → picker lists scenes, edits hot-reload, broken scene shows error and recovers

## 5. Init command (cli-init)

- [x] 5.1 `templates/default/` files: `hello-world.ts` scene, `main.ts` composing scenes via `Scene.chain`, `motion.config.ts` with both targets, strict `tsconfig.json`, `.gitignore`, package.json template with exact-version pin constants baked at CLI build/release time
- [x] 5.2 Interactive flow with `effect/unstable/cli` `Prompt` (`text`/`select`): directory prompt (positional skips it; `.` → cwd basename; non-empty dir refused), package-manager prompt defaulting from `npm_config_user_agent`, name substitution, install via `ChildProcessSpawner` with `--no-install` opt-out, next-steps message
- [x] 5.3 Test: scaffold into a temp dir → generated files match spec, versions are exact; e2e (may be CI-only): install + `render` succeeds on the fresh scaffold

## 6. Docs and release wiring

- [x] 6.1 CLI README: commands, config reference, ffmpeg-static GPL note, preview-vs-export rasterizer caveat
- [x] 6.2 Docs site page for getting started via `motion init`; verify `pnpm build && pnpm check && pnpm lint` pass workspace-wide (no NEW failures vs baseline)
