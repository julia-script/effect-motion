## Why

The library has no docs. Its selling point — animated scenes — is best explained by live examples, and the `@effect-motion/react` Player exists precisely to embed them. A Fumadocs site with runnable examples becomes both the documentation and the demo. Blocking prerequisite: both packages ship raw TS source, which Next.js won't compile from `node_modules`; the packages need real builds first.

## What Changes

- Both packages (`effect-motion`, `@effect-motion/react`) get a `tsc` build emitting ESM + `.d.ts` to `dist/`, and their `exports` switch from `./src/index.ts` to built output. **BREAKING** for consumers that resolved raw TS.
- `apps/playground` is removed; the docs app replaces it, including a `/scratchpad` route for ad-hoc scene experiments.
- Turbo gets a real task graph: `build` with `dependsOn: ["^build"]` and `outputs: ["dist/**"]`; `dev` depends on `^build` so apps always see fresh packages. Tests keep importing `../src` and stay build-free.
- New `apps/docs`: a Next.js + Fumadocs site with MDX pages (getting started, concepts) and an examples section.
- An `Example` client component that renders a scene in the `<Player>` alongside its own source code — each example is one TS file, executed and displayed from the same source so code and animation can't drift.
- Four seeded examples: easing race, springs, groups, seeded randomness.

## Capabilities

### New Capabilities

- `package-distribution`: packages ship compiled ESM with type declarations under `dist/`, resolvable by any bundler without transpiling workspace source.
- `docs-site`: the Fumadocs documentation app — MDX content, live Player-embedded examples with drift-free source display.

### Modified Capabilities

<!-- none — core runtime and react-player behavior are unchanged; only packaging moves -->

## Impact

- `packages/motion`, `packages/react`: build tsconfigs, `exports`/`files` changes, `dist/` gitignored.
- `turbo.json`: new `build` task, `dev` gains `dependsOn: ["^build"]`.
- `apps/playground` deleted (with its `.claude/launch.json` entry and the root `playground` script); its demo scene lives on as the docs examples and the vite dependency goes away.
- New `apps/docs` with Next.js, Fumadocs (`fumadocs-ui`, `fumadocs-core`, `fumadocs-mdx`) — the monorepo's only app and first real build outputs.
