## Context

Both packages export raw TS source (`exports: "." → ./src/index.ts`). Vite (playground) and vitest compile it transparently; Next.js does not compile `node_modules` and would need `transpilePackages`. Decision from exploration: build the packages properly instead. The docs site is Fumadocs (App-Router-native, maintained), chosen over plain Next.js (docs chrome is commodity) and Nextra (slowed momentum). The `<Player>` is client-only: it collects frames on mount and renders via rAF into live DOM.

## Goals / Non-Goals

**Goals:**
- `dist/` builds (ESM + `.d.ts`) for `effect-motion` and `@effect-motion/react`; consumers resolve normal compiled packages.
- Turbo task graph: cached `build`, `dev`/`test` wired so everything works from a fresh clone with one command.
- `apps/docs`: Fumadocs site with a few content pages and four live examples.
- Drift-free examples: one source file per example, both executed and displayed.
- Replace the playground: delete `apps/playground`; a `/scratchpad` route in docs (a plain client page with a `<Player>` and an easily editable inline scene) covers ad-hoc experimentation.

**Non-Goals:**
- Publishing to npm (exports/files get publish-ready, but no release tooling).
- Lazy example collection (IntersectionObserver) — deferred; a page runs all its scenes on mount for now.
- Search tuning, custom theming, versioned docs, deployment target/CI.
- CJS output, bundled/minified output — ESM-only `tsc` emit.

## Decisions

**1. Plain `tsc` for package builds, no bundler.**
Libraries consumed by bundlers need `.js` + `.d.ts`, not bundling. Each package gets a `tsconfig.build.json` (extends its tsconfig: `noEmit: false`, `declaration: true`, `outDir: dist`, `rootDir: src`, includes only `src`). Build script: `tsc -p tsconfig.build.json`.
- Alternative (tsup/tsdown): adds a dependency and config for features we don't need (CJS, minify). Revisit at publish time if ever.

**2. `exports` points at `dist`, tests stay on `src`.**
`".": { types: "./dist/index.d.ts", default: "./dist/index.js" }` plus `files: ["dist"]`. Tests import `../src` directly, so `test` tasks never depend on `build`. The react package's workspace dep on `effect-motion` now resolves to its `dist` — fine, turbo orders builds.
- Trade-off (accepted in exploration): cross-package HMR becomes rebuild-then-reload; `turbo watch build` closes the gap when wanted.

**2b. Playground is deleted, not migrated.**
With docs examples covering the demo role, the playground is redundant; its scene material moves into the example files. A `/scratchpad` route in docs — an ordinary client page rendering `<Player>` with an inline scene meant to be edited in place — replaces "somewhere to try things quickly". Not linked from the sidebar.
- Alternative (keep playground on vite): a second app, second dev server, and the only consumer still compiling raw TS — all cost, no distinct value.

**3. Turbo graph.**
`build: { dependsOn: ["^build"], outputs: ["dist/**", ".next/**", "!.next/cache/**"] }`; `dev` and `check` gain `dependsOn: ["^build"]` (`check` needs dependency `.d.ts` to exist since consumers now typecheck against `dist`). `test` stays flat.

**4. Docs app: standard Fumadocs scaffold.**
`apps/docs` with `fumadocs-ui`, `fumadocs-core`, `fumadocs-mdx`, Next 15. Content in `content/docs/*.mdx`: index (what/why + hero example), getting-started, and one page per example under `examples/`. Default theme, no customization.

**5. Examples: one file, executed and displayed.**
Each example lives in `examples/<name>.scene.ts` exporting a scene, keyed in a registry module. MDX pages write `<Example name="easing-race" />`: `Example` is a **server** component that reads the scene file from disk (`fs.readFileSync`) for display, and renders a `"use client"` child that looks the scene up in the registry for playback. Same file feeds both paths, so drift is structurally impossible — and no bundler configuration is involved at all.
- (Revised during implementation: the originally planned `?raw` imports turned out unnecessary — docs pages are server-rendered, so plain `fs` beats webpack/Turbopack rule wrangling.)
- Why not copy code into MDX fences: drift. Why not react-live/sandpack: heavyweight; examples aren't editable (non-goal).
- Code highlighting via Fumadocs' `DynamicCodeBlock` so example code matches the site's fenced blocks.

**6. Player SSR boundary.**
The `Example` component is a client component; the Player only touches DOM inside effects, so no `ssr: false` dynamic import gymnastics are needed — the server renders the shell, the scene collects on hydration.

## Risks / Trade-offs

- [Fumadocs moves fast; scaffold details in tasks may not match the current version] → tasks state intent, not exact file contents; follow the current Fumadocs docs when wiring `source.config.ts`/`loader`.
- [Stale `dist` confuses local dev after pulling changes] → `dev`/`check` depend on `^build`, so turbo rebuilds automatically; document `pnpm build` as the fresh-clone step.
- [Next's TypeScript integration requires the classic compiler] → the docs app pins `typescript` 6.x while the packages build with 7.x; both coexist per-workspace.
- [First `next build` in the repo may surface monorepo quirks (lockfile root inference)] → set `outputFileTracingRoot` if Next warns.

## Open Questions

- None blocking. Deployment (Vercel/static) intentionally deferred.
