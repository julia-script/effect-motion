# create-effect-motion

## 0.4.1

## 0.4.0

### Minor Changes

- 10e5d1b: Scaffolding moves to the new `create-effect-motion` package: run `pnpm create effect-motion` (or the npm/yarn/bun equivalent) instead of `motion init`.

  **BREAKING** (`@effect-motion/cli`): the `motion init` command is removed. The scaffold behavior is unchanged — same prompts, generated tree, and exact dependency pins — plus two additions: an optional Biome setup (`--biome`/`--no-biome`, prompt defaults to yes) and a `--yes` flag for fully non-interactive runs. `create-effect-motion` releases in lockstep with the other packages, so its scaffolds always pin the current versions.
