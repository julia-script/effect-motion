# CLI Entrypoints

## Why

`motion.config.ts` is the last stringly-typed boundary in the system: it names scenes by file path, so a scene's typed resource requirements (`FontLoader`/`ImageLoader` in `R`, from the typed-resource-loaders change) are erased at the config and there is nowhere to provide loader layers — a scene with fonts cannot be rendered or previewed through the CLI at all. Replacing the config with code entrypoints moves the type check into the files where the literal types live (the same move renderLayers made for the Player), and deletes the config/glob/watcher machinery the string boundary forced the CLI to carry.

## What Changes

- **BREAKING — `motion.config.ts` is removed** (`defineConfig`, targets, config discovery, `Config.ts`/`ConfigLoader.ts` validation and precedence machinery).
- **New `studio.ts` entrypoint**: `export default studioConfig({ scenes, layers })` — a RECORD of scenes (keys are the unique picker identifiers), values a bare scene or `{ scene, ...playerOptions }`, and ONE `layers` covering the union of every scene's resources (`Scene.Resources` distributes over unions; same conditionally-required typing as `PlayerProps.renderLayers`). Explicit registration replaces the `src/scenes/*.ts` glob — which also deletes the studio's out-of-root watcher plugin, since every scene now lives in `studio.ts`'s import graph and plain Vite HMR covers it.
- **New `render.ts` entrypoint**: an ordinary program calling `Video.render(scene, out, opts).pipe(Effect.provide(layers))` — the loader requirement is enforced by `Video.render`'s own signature at authoring time. `motion render [file]` (default `./render.ts`) loads it through the shared Vite pipeline, provides the Node platform services, runs the default-exported effect, and renders failures as CLI errors. All render flags (`--fps`, `--seed`, `--dpr`, …) are removed — code is the config.
- **`motion studio [file]`**: positional entrypoint (default `./studio.ts`, error with a hint if absent — no discovery walk). Multiple studio configs are multiple files.
- **Named scenes**: `Scene.make("The Scene", function* () {…}, meta?)` — an optional leading display name carried as `scene.name`; the studio picker labels entries `scene.name ?? record key`. The record key stays the unique identifier; the name is display-only.
- **`Resource.fetchBytes` memoizes per URL** (module-level cache), so per-mount layer rebuilds in the studio (scene switches) never refetch immutable asset bytes.
- Template (`create-effect-motion`) ships `render.ts` + `studio.ts` instead of `motion.config.ts`; `AGENTS.md` and `cli.mdx` rewritten.

## Capabilities

### New Capabilities

- `studio-config`: the `studio.ts` contract — the browser-safe, branded `studioConfig` helper: scene record with unique keys, per-entry player options, union-typed `layers`, display-name fallback.

### Modified Capabilities

- `cli-render`: config targets, flag overrides, and configless direct-scene rendering replaced by executing a render entrypoint program.
- `cli-studio`: glob discovery and config-target settings replaced by the `studio.ts` entrypoint (positional file, explicit record, import-graph HMR); load-failure reporting retained against the entrypoint.
- `cli-init`: scaffold produces `render.ts` + `studio.ts` (registering the hello scene) instead of `motion.config.ts`.
- `motion-config`: the capability is removed entirely (all requirements deleted; the spec directory goes with it at archive, like scene-metadata).
- `scene-composition`: `Scene.make` gains the optional leading name; scene values carry `name?`. (The requirement text also still references the removed `annotate` mechanism — the delta drops it.)
- `video-encoding`: `@effect-motion/export` documents/exposes the Node wiring so a `render.ts` is runnable standalone (the only leftover requirement is the platform's `ChildProcessSpawner`).
- `resource-loaders`: `fetchBytes` memoizes per URL.

## Impact

- `packages/cli`: `Config.ts`/`ConfigLoader.ts` largely deleted; new `StudioConfig.ts` (browser-safe helper); `commands/render.ts` rewritten as an executor; `commands/studio.ts` loses config discovery and the `motion:project-watch` plugin; `studio-app/App.tsx` rewritten around one typed import (drops the hand-rolled `ConfigLike` mirror, glob, and path juggling).
- `packages/motion`: `Scene.make` overload + `name?` on the Scene value; `Resource.fetchBytes` memoization.
- `packages/export`: no signature change expected — verify `NodeServices`-style provision story and document it.
- `packages/create-effect-motion`: template rewrite; cli tests and fixtures (`packages/cli/test/fixtures/basic/motion.config.ts`) rewritten; `.claude/launch.json` `motion-studio` fixture args updated.
- `apps/docs/content/docs/cli.mdx` rewritten.
- Known acceptances: CLI flag overrides are gone by design (determinism, one source of truth); a render entrypoint whose exported effect requires services the CLI does not provide fails at run time with the named missing service, not at compile time (no helper wraps render.ts — `Video.render`'s own types cover the loader half, which is the half that matters).
