## Why

The three publishable packages (`effect-motion`, `@effect-motion/react`, `@effect-motion/export`) ship to npm with no README, so their npm pages render blank — no description, install command, or example. This is the last gap before the `0.1.0` release: a package's README is its landing page and the first thing a prospective user sees.

## What Changes

- Add a `README.md` to each of the three published packages: `packages/motion`, `packages/react`, `packages/export`.
- Each README covers: one-line description, install command (with the `effect` peer-dependency note), a minimal runnable example, and a link back to the docs site and repo.
- READMEs are already covered by the `files` allowlist implicitly (npm always includes `README.md`), so no `package.json` change is required — but this change verifies each package publishes its README.

## Capabilities

### New Capabilities
- `package-readmes`: Each published workspace package ships a README that renders as its npm landing page, covering description, installation (including the effect peer dependency), a minimal example, and links to docs and source.

### Modified Capabilities
<!-- None: build/consumption mechanics live in package-distribution and are unchanged. -->

## Impact

- New files: `packages/motion/README.md`, `packages/react/README.md`, `packages/export/README.md`.
- No code, dependency, or build-config changes. The docs site (`apps/docs`) remains the canonical long-form documentation; READMEs are concise entry points that link to it.
