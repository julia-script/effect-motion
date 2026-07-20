# Tasks: CLI Entrypoints

## 1. Core library groundwork (packages/motion)

- [x] 1.1 `Scene.make` optional leading name — overloads `(gen, meta?)` and `(name, gen, meta?)`; `readonly name?: string` on the Scene value; tests: named/unnamed values, identical frames with and without a name
- [x] 1.2 `Resource.fetchBytes` per-URL module cache (failed fetches not cached); tests: single fetch across two layer constructions, retry after failure

## 2. studioConfig (packages/cli)

- [x] 2.1 New browser-safe `StudioConfig.ts`: branded `studioConfig` identity helper; `scenes` record of `Scene.AnyScene | { scene } & PlayerOptions` (PlayerOptions derived from `PlayerProps`, replacing the studio app's hand-copied mirror); `layers` conditionally required against the union of entry resources
- [x] 2.2 Type-level tests: union coverage required (missing one scene's loader fails), `layers` forbidden when the union is never, bare-vs-entry polymorphism, duplicate record keys impossible
- [x] 2.3 Runtime validation for the untyped escape hatch: brand check + per-entry shape check naming the file and key

## 3. Studio command + app rewrite

- [x] 3.1 `motion studio [file]` positional (default `./studio.ts`, exit non-zero naming the path when absent); delete `findConfig` usage and the `motion:project-watch` plugin; generated `project.ts` carries the entrypoint's absolute path
- [x] 3.2 `studio-app/App.tsx` rewrite: one typed import of the entrypoint via `/@fs`, picker over record entries (label = `scene.name ?? key`), Player mounted with entry player options and config `layers` as `renderLayers`; delete `ConfigLike`/glob/path juggling
- [x] 3.3 Error panel covers: entrypoint module throwing, non-`studioConfig` default export (naming file + contract), recovery on next save; verify HMR on scene edit AND on adding a registration (no bespoke watcher)

## 4. Render command rewrite

- [x] 4.1 `motion render [file]`: load default `./render.ts` (or positional) via ViteLoader, validate default export is an Effect (error naming file otherwise), provide Node platform services, run, CLI-rendered failure messages; delete all render flags and target machinery
- [x] 4.2 Delete `Config.ts`/`ConfigLoader.ts` (config types, `defineConfig`, `validateConfig`, `resolveTarget`, discovery walk); keep `ViteLoader`
- [x] 4.3 CLI tests rewritten on entrypoint fixtures (`packages/cli/test/fixtures/basic`: `render.ts` + `studio.ts` replacing `motion.config.ts`); `.claude/launch.json` `motion-studio` args updated to the new fixture

## 5. Export package contract

- [x] 5.1 Verify + document the standalone contract: `Video.render(...).pipe(Effect.provide(layers), Effect.provide(NodeServices...))` runs via `tsx` with output identical to `motion render`; one test exercising the documented pipe

## 6. Template + docs

- [x] 6.1 `create-effect-motion` template: delete `motion.config.ts`; add `studio.ts` (registering hello-world + main with a named hello scene) and `render.ts` (default-exported `Video.render` effect to `./output`); update `AGENTS.md` for the two entrypoint contracts; scaffold renders and previews with no edits
- [x] 6.2 Rewrite `apps/docs/content/docs/cli.mdx`: entrypoint contracts, `motion render [file]` / `motion studio [file]`, migration notes (targets → `Video.render` calls; flags → code; glob → registration)
- [x] 6.3 Full verification: `pnpm build`, cli/motion/export/template test suites, lint on touched files — no new failures vs baseline; note for archive: delete `openspec/specs/motion-config/` manually (empty-spec validator, scene-metadata precedent)
