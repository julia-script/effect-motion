## 1. Package builds

- [x] 1.1 Add `tsconfig.build.json` to `packages/motion` and `packages/react` (extends package tsconfig; `noEmit: false`, `declaration: true`, `outDir: dist`, `rootDir: src`, include `src` only) and a `build: tsc -p tsconfig.build.json` script in each
- [x] 1.2 Switch both packages' `exports` to `{ types: ./dist/index.d.ts, default: ./dist/index.js }`, add `files: ["dist"]`, gitignore `dist`
- [x] 1.3 Update `turbo.json`: add `build` (`dependsOn: ["^build"]`, outputs `dist/**`, `.next/**` minus cache); give `dev` and `check` `dependsOn: ["^build"]`; root script `pnpm build`
- [x] 1.4 Verify: `pnpm build` builds motion → react in order; `pnpm test` passes with `dist/` deleted

## 2. Docs app scaffold

- [x] 2.1 Scaffold `apps/docs` with Next 16 + Fumadocs (`fumadocs-ui`, `fumadocs-core`, `fumadocs-mdx`): app router layout, docs layout, `source.config.ts`, catch-all docs route, following current Fumadocs conventions (v16.1.3 template)
- [x] 2.2 Wire workspace deps (`effect-motion`, `@effect-motion/react`, `effect`); source display via `fs.readFileSync` in the server-side `Example` component instead of `?raw` imports (see design decision 5)
- [x] 2.3 Content: `index.mdx` (what the library is, hero example) and `getting-started.mdx` (install, first scene, Player usage)
- [x] 2.4 Verify: docs `dev` starts after auto-building packages; both pages render with sidebar and TOC

## 3. Live examples

- [x] 3.1 Create the `Example` component (server: reads source; client child: plays the scene from the registry) with Fumadocs' highlighted code block; register it for MDX use
- [x] 3.2 Add the four example scene files (easing race, springs, groups, seeded randomness — adapted from the playground scene) and an `examples/` MDX page per scene embedding `<Example>`
- [x] 3.3 Add the `/scratchpad` route: plain client page with an inline scene in a `<Player>`, not linked from the sidebar
- [x] 3.4 Verify in the browser: each example page plays its scene with working transport controls and shows its highlighted source; editing a scene file updates both the animation and the displayed code; `/scratchpad` plays

## 4. Retire the playground & wrap-up

- [x] 4.1 Delete `apps/playground`, the root `playground` script, and its `.claude/launch.json` entry; add a docs `dev` entry there instead
- [x] 4.2 `pnpm build`, `pnpm turbo run check test`, and `pnpm lint` all green; update root README-ish docs pointers if any exist
