## 1. Core package README

- [x] 1.1 Write `packages/motion/README.md`: one-line description, `pnpm add effect-motion effect` install (note the effect peer dep), the getting-started scene example (`Scene.make` + `Motion.tweenTo`), a one-line note on determinism, and links to the docs site and repo.

## 2. React package README

- [x] 2.1 Write `packages/react/README.md`: description, `pnpm add @effect-motion/react effect-motion effect` install, the `<Player>` example (and a mention of `usePlayer` for custom UI), and links to docs and repo.

## 3. Export package README

- [x] 3.1 `packages/export/README.md` already exists and is accurate (Node-only PNG/MP4 export, `Video.render` example with `NodeServices.layer`, bundled-ffmpeg + GPL licensing note). Verified against the current API and the export docs — no rewrite needed.

## 4. Verify

- [x] 4.1 Confirm each example's imports resolve against the package's `src/index.ts` exports. (motion: Motion/Scene/Shapes; react: Player/usePlayer; export: Video — all present.)
- [x] 4.2 Run `pnpm pack --dry-run` in each of the three package dirs and confirm `README.md` appears in the file list. (Present in all three.)
