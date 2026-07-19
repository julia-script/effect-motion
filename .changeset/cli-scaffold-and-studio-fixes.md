---
"@effect-motion/cli": patch
---

Two `motion` CLI fixes:

- Scaffold pins are now derived from the CLI's own package.json (all `@effect-motion/*` packages release in lockstep) instead of a hardcoded list that had gone stale — `motion init` no longer scaffolds outdated versions.
- `motion studio` sets `esbuild: { jsx: "automatic" }` in its vite config. Scaffolded projects set no `jsx` in tsconfig, so esbuild fell back to the classic transform and the studio crashed before mount ("React is not defined") — rendering a blank page.
