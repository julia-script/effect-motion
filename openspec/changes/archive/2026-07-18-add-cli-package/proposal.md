## Why

Today, using effect-motion outside this monorepo means hand-assembling a project: package.json, tsconfig, a scene file, a bespoke script that calls `Video.render`, and a bespoke Vite app if you want to preview anything. Every capability needed for a real workflow (streaming scenes, the React player, ThorVG rasterization, ffmpeg encoding) has shipped — what's missing is the front door. A CLI closes the loop from "empty directory" to "previewed and rendered video" without the user writing any infrastructure.

## What Changes

- New workspace package `packages/cli`, published as `@effect-motion/cli`, exposing a `motion` bin with three commands. The CLI is written in idiomatic Effect end-to-end: commands, flags, arguments, and interactive prompts come from the pinned effect version's own Command API (`effect/unstable/cli`), platform access goes through Effect platform services, and all failures flow through one tagged CLI error type that wraps upstream errors or carries custom ones.
  - **`motion init`** — create-next-app-style scaffolder: prompts for a target directory (`.` uses the current directory's name as the project name) and a package manager, then generates a single-project workspace (`src/scenes/`, `src/assets/`, `src/main.ts`, `motion.config.ts`, `package.json`, `tsconfig.json`) with pinned, known-good `effect-motion` + `effect` versions and installs dependencies.
  - **`motion studio`** — Vite dev server hosting the `@effect-motion/react` Player over the project's scenes, with hot reload. v1 is just the player plus a scene picker; timelines/inspection come later.
  - **`motion render`** — renders targets from the config file via `@effect-motion/export`. Supports `--config <path>` (tsc `-p` style), target-name filtering, flag overrides of config settings, and a configless mode that renders a scene file directly with defaults.
- New config contract: `motion.config.ts` with a typed `defineConfig` helper. A config declares named **targets**; each target names a scene module, `settings` (the Runner's `Settings` subset plus `dpr`), and an **output directory** — the output filename is derived (target name + container extension), not user-specified.
- The config is the only orchestration surface the CLI knows about. `src/main.ts` in the scaffold is a plain scene that composes the others (`Scene.chain`) and is registered as an ordinary target — no magic filenames.
- User TypeScript (config and scenes) is loaded through Vite in both `studio` and `render`, so preview and export resolve the same module graph.

Out of scope for this change: multi-project directories (config shape must not preclude it), studio timeline/inspection features, a separate `create-effect-motion` package, watch-mode rendering.

## Capabilities

### New Capabilities
- `cli-core`: the command shell shared by all subcommands — Effect Command API structure (subcommands, help/version), the unified tagged error type and its wrap-at-the-boundary rule, and terminal error reporting/exit codes.
- `motion-config`: the `motion.config.ts` contract — `defineConfig` typing, target shape (scene module, settings incl. `dpr`, output directory, derived filenames), config discovery, and how user TS is loaded.
- `cli-init`: project scaffolding — prompts, directory/name resolution, generated file tree, dependency pinning, package-manager-aware install.
- `cli-studio`: the preview dev server — player hosting, scene discovery (config targets plus unregistered `src/scenes/*` files), hot reload.
- `cli-render`: the render command — config resolution, target selection, flag overrides and precedence, configless direct-scene rendering, output path derivation.

### Modified Capabilities

(none — existing runtime/spec behavior is untouched; the CLI composes published APIs)

## Impact

- New package `packages/cli` in the pnpm workspace + Turbo graph; new runtime dependencies scoped to it are Vite and `@effect/platform-node` only — command parsing and prompts come from `effect` itself (`effect/unstable/cli`), so no CLI-framework or prompt dependency is added. Core packages are not modified.
- Depends on `effect-motion`, `@effect-motion/react`, and `@effect-motion/export` public APIs (`Scene.stream`, `Player`, `Video.render`). Any gaps found (e.g. `dpr` living in `VideoOptions` rather than settings) are adapted inside the CLI, not by changing those packages in this change. *(Apply-time deviations: an additive `PlayerProps.settings` prop and a repo-wide `.js` import-specifier fix for Node-ESM compatibility — see design.md "Deviations discovered during apply".)*
- The `package-distribution` spec predates `@effect-motion/export`/`@effect-motion/thorvg` and names packages explicitly; it is already stale and is not updated here (pre-existing baseline).
- The `ffmpeg-static` binary (GPL, process-boundary separation) is pulled in transitively via `@effect-motion/export` for anyone installing the CLI — same posture as today, worth restating in the CLI README.
