# Proposal: create-effect-motion package

## Why

Scaffolding currently lives inside `@effect-motion/cli` as `motion init`, which forces first-time users through `npx @effect-motion/cli init` and downloads the entire CLI (vite, `@effect/platform-node`, the studio app) just to copy a handful of template files. Publishing a dedicated `create-effect-motion` package unlocks the standard `pnpm create effect-motion` / `npm create effect-motion` entry point — the discovery path users already know from create-vite and create-next-app — and gives the scaffolder room to grow its own prompts (starting with an optional Biome setup).

Template dependency freshness needs no new machinery: the existing pins pattern (derive exact versions from the package's own published `package.json`) plus membership in the changesets `fixed` group means every release automatically ships a scaffolder with current pins.

## What Changes

- New workspace package `packages/create-effect-motion`, published unscoped as `create-effect-motion`, so `pnpm create effect-motion` / `npm create effect-motion` / `yarn create effect-motion` / `bun create effect-motion` work.
- The scaffold core moves there from the CLI: `scaffold.ts`, `pins.ts`, `templates/default/`, and the directory/package-manager prompts and install step from `init.ts`, plus `test/scaffold.test.ts`.
- New interactive prompt: "Add Biome for linting/formatting?" (default Yes). Selecting it writes a `biome.json` matching the template's existing formatting (tabs, double quotes), adds `@biomejs/biome` to devDependencies, and adds `lint` / `lint:fix` scripts. Non-interactive twin flags `--biome` / `--no-biome`.
- New `--yes` flag accepting all defaults, alongside the existing `--pm` and `--no-install` flags carried over from `motion init`.
- The scaffolder runs `git init` in the new project when it is not already inside a git repository; failures (git absent) are non-fatal.
- **BREAKING**: `motion init` is removed from `@effect-motion/cli`; `templates/` leaves its published `files`. The CLI's help/README point at `pnpm create effect-motion`.
- `create-effect-motion` joins the changesets `fixed` group so its version — and therefore its derived pins — moves in lockstep with every release.

## Capabilities

### New Capabilities

- `create-effect-motion`: project scaffolding via the package-manager `create` convention — prompts (directory, package manager, Biome), exact dependency pinning derived from the scaffolder's own release, generated project tree, git init, and install. Absorbs and supersedes the requirements of `cli-init`.

### Modified Capabilities

- `cli-init`: capability removed — all requirements migrate to `create-effect-motion` (the scaffold behavior itself is preserved; only the entry point and packaging change).

## Impact

- **New**: `packages/create-effect-motion` (bin, prompts, scaffold, pins, templates, tests).
- **Modified**: `packages/cli` — `init` command, `scaffold.ts`, `pins.ts`, `templates/`, and scaffold tests removed; `package.json` `files`/description updated; README updated.
- **Modified**: `.changeset/config.json` — `create-effect-motion` added to the `fixed` group.
- **Unchanged**: release workflow (`.github/workflows/release.yml`), all other packages, the studio app (stays in the CLI).
- **Dependencies**: `create-effect-motion` depends on `effect` (prompts via `effect/unstable/cli`, and the source of the exact `effect` pin) and `@effect/platform-node`; `@biomejs/biome` becomes a template companion pin (range, not exact — not determinism-critical).
