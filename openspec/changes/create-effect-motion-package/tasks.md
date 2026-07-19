# Tasks: create-effect-motion package

## 1. Package skeleton

- [x] 1.1 Verify the `create-effect-motion` name is available on npm (fallback: `@effect-motion/create`; record the outcome in design.md if the fallback is needed)
- [x] 1.2 Create `packages/create-effect-motion` with `package.json` (unscoped name, `bin: { "create-effect-motion": "./dist/bin.js" }`, `files: ["dist", "templates"]`, deps `effect` + `@effect/platform-node` at the repo's pinned versions), `tsconfig.json`/`tsconfig.build.json`, and `vitest.config.ts` mirroring the CLI package's setup
- [x] 1.3 Add `create-effect-motion` to the `fixed` group in `.changeset/config.json`

## 2. Move the scaffold core

- [x] 2.1 Move `templates/default/` from `packages/cli` to `packages/create-effect-motion` unchanged
- [x] 2.2 Move `scaffold.ts` and `pins.ts` over (imports adjusted; `templatesDir`, `_gitignore` rename, and generated-`package.json` comments preserved); copy the small `MotionCliError` tagged-error module in as the package's error type
- [x] 2.3 Move the prompt + install logic from `src/commands/init.ts` into the new package's command (directory positional, `--pm`, `--no-install`, pm detection from `npm_config_user_agent`), wired to a `bin.ts` entry
- [x] 2.4 Move `test/scaffold.test.ts` over and get it passing in the new package

## 3. New scaffold features

- [x] 3.1 Add the Biome prompt (default Yes) with `--biome`/`--no-biome` flags: conditional `biome.json` (formatter matching template formatting: tabs, double quotes), `@biomejs/biome` in `COMPANIONS` and generated `devDependencies`, `lint`/`lint:fix` scripts
- [x] 3.2 Add `--yes` (accept defaults for any prompt not answered by an explicit flag; explicit flags win)
- [x] 3.3 Add silent `git init` after scaffold, skipped inside an existing work tree, non-fatal on failure
- [x] 3.4 Tests: Biome on/off scaffold contents, `--yes` non-interactive run, `biome check` exits clean on a Biome-enabled scaffold, git init skip-inside-repo

## 4. Remove init from the CLI

- [x] 4.1 Delete `src/commands/init.ts`, `src/scaffold.ts`, `src/pins.ts`, `templates/`, and `test/scaffold.test.ts` from `packages/cli`; unregister the command; drop `templates` from `files`
- [x] 4.2 Update the CLI README/description to point at `pnpm create effect-motion`; write the new package's README
- [x] 4.3 Changeset: minor for `@effect-motion/cli` (BREAKING note: `motion init` removed, use `pnpm create effect-motion`) covering the new package's first release

## 5. Verification

- [x] 5.1 `pnpm build && pnpm check && pnpm test && pnpm lint` clean at the repo root
- [x] 5.2 End-to-end: `pnpm pack` the new package, scaffold a project from the tarball outside the workspace (`--pm pnpm`), install with pins rewritten to workspace tarballs or the latest published versions, and confirm `motion render` produces MP4s and `biome check` passes
