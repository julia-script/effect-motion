# Design: create-effect-motion package

## Context

Scaffolding today is `motion init` inside `@effect-motion/cli`: [init.ts](../../../packages/cli/src/commands/init.ts) (prompts + install), [scaffold.ts](../../../packages/cli/src/scaffold.ts) (copy tree + generate `package.json`), [pins.ts](../../../packages/cli/src/pins.ts) (exact versions derived at runtime from the CLI's own published `package.json`), and `templates/default/`. The generated `package.json` is never a template file — it is synthesized from `PINS`/`COMPANIONS`, which is what keeps scaffolds current on every release: all publishable packages share one version via the changesets `fixed` group, so "the scaffolder's own version" is the pin for every sibling.

The scaffold core is already cleanly separated — its only intra-CLI import is `MotionCliError` — which makes this a move, not a rewrite.

## Goals / Non-Goals

**Goals:**

- `pnpm create effect-motion` (and npm/yarn/bun equivalents) as the single scaffolding entry point.
- Pins stay automatically current on every release with zero release-pipeline changes.
- Optional Biome setup chosen at scaffold time.
- Scaffold behavior (directory resolution, empty-dir check, generated tree, install) preserved verbatim from `cli-init`.

**Non-Goals:**

- Multiple templates / a `--template` flag (one template exists; the flag appears when a second one does).
- A JavaScript (non-TypeScript) variant — there is no JS story for effect-motion.
- Zero-dependency bundling of the create package (see Decisions).
- Any change to `motion studio` / `motion render` or the studio app.

## Decisions

### 1. Real move, not a wrapper

`create-effect-motion` owns the scaffold code and templates; the CLI loses `init` entirely. A thin wrapper (create package depending on the CLI) was rejected: `npm create` would cold-download vite, `@effect/platform-node`, and the studio app to copy six files. Keeping `motion init` alongside was rejected: it would need either a CLI→create-package workspace dependency (inverted dependency direction) or duplicated scaffold code, and nobody inits inside an existing project.

### 2. Effect-based, not zero-dep

The package keeps `effect` + `@effect/platform-node` as real dependencies and uses `effect/unstable/cli` prompts, exactly like the current init command. Rationale: matches repo conventions (AGENTS.md, one tagged error type), and `dependencies.effect` in its own `package.json` is the source of the exact effect pin — the identical mechanism pins.ts uses today, no new machinery. A create-vite-style zero-dep bundle would shave npx cold-start but requires a bundler the repo doesn't use and a new home for the effect pin. Revisit only if cold-start complaints materialize.

### 3. Version sync via fixed group + self-derived pins (no automation)

Add `create-effect-motion` to the `fixed` array in `.changeset/config.json`. `pins.ts` moves over unchanged in shape: `PINS` reads the package's own `version` (which equals every `@effect-motion/*` version, by lockstep) and `dependencies.effect`. `npm create effect-motion` resolves `latest`, so every scaffold uses the current release's pins. No CI step, no version-rewriting script.

### 4. Biome as a generated-layer option, not a template fork

`templates/default/` stays branchless. The Biome choice only affects the synthesized layer:

- `biome.json` written next to the generated `package.json` when selected. Its formatter settings must match how the template files are formatted (tabs, double quotes — the repo's own Biome config formats them), so a fresh scaffold passes `biome check` clean.
- `@biomejs/biome` added to `COMPANIONS` (caret range — not determinism-critical) and to the generated `devDependencies` when selected.
- `"lint": "biome check ."` / `"lint:fix": "biome check --fix ."` scripts added when selected.

Prompt default is **Yes** (the project itself uses Biome; formatter-included is the modern scaffold default). Flags `--biome` / `--no-biome` skip the prompt.

### 5. Prompt/flag surface

Directory (positional arg or prompt), package manager (`--pm` or prompt, detected manager from `npm_config_user_agent` listed first), Biome (`--biome`/`--no-biome` or prompt), `--no-install`, and new `--yes` (accept all defaults: `my-motion-project`, detected pm, Biome yes). `--yes` composes with explicit flags (explicit wins).

### 6. Silent git init

After scaffolding, run `git init` in the project directory unless it is already inside a git work tree (`git rev-parse --is-inside-work-tree` succeeds from the target dir). No prompt (create-next-app behavior); git being absent or the command failing is non-fatal and just skipped — the template already ships `_gitignore` → `.gitignore` regardless.

### 7. Packaging details that must survive the move

- npm mangles nested `.gitignore` and `package.json` in published tarballs — the `_gitignore` rename and the generated (never templated) `package.json` carry over as-is, with their explanatory comments.
- `templatesDir` resolves relative to the built module (`dist/… → ../templates`); the new package keeps the same `dist` + `templates` layout and `files: ["dist", "templates"]`.
- Bin name: `create-effect-motion` (what `npm create` invokes). `publishConfig.access` is not needed (unscoped), but the package must not be `private`.
- The CLI keeps `MotionCliError`; the create package gets its own copy of the small tagged-error module (two files, ~20 lines, no shared package for it — not worth a workspace dependency).

## Risks / Trade-offs

- [Unscoped name `create-effect-motion` could be squatted or blocked on npm] → Verify availability before implementation; fallback is `@effect-motion/create` (`npm create @effect-motion`), which changes the invocation but nothing else.
- [Users on old docs run `motion init` and hit an unknown-command error] → The removal ships as a minor with a changeset note; CLI README and error surface name `pnpm create effect-motion`.
- [Biome formatter config drifts from template formatting] → The scaffold e2e test runs `biome check` on a Biome-enabled scaffold, so drift fails CI.
- [effect pin read from `dependencies` breaks if the create package ever drops effect] → Decision 2 makes effect a load-bearing dependency; revisiting zero-dep requires re-homing the pin consciously.

## Migration Plan

Single release: the create package publishes and `motion init` disappears in the same lockstep version. No data or config migration; existing scaffolded projects are unaffected. Rollback is reverting the release.

## Open Questions

None — naming fallback and biome defaults are decided above pending only the npm availability check at implementation time.
