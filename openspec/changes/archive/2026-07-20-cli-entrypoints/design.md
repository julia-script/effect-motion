# Design: CLI Entrypoints

## Context

`motion.config.ts` declares targets as `{ name, scene: "./path.ts", settings, player, output }`. Both CLI commands erase types at that boundary: `commands/render.ts` casts the dynamically-loaded module to `Scene.Scene<never, never>`, and the studio app re-declares `ConfigLike`/`TargetLike` by hand, globs `src/scenes/*.ts`, and mounts the Player untyped. Since typed-resource-loaders, scenes can carry loader requirements that MUST be provided at render — the config has no place for them. The studio additionally carries a watcher plugin (`invalidateAll` + full reload on add/unlink) solely because globbed scenes live outside Vite's module graph.

Precedent for the fix ships in this repo already: the docs example registry holds `{ scene, renderLayers }` values validated where they are authored, then crosses its dynamic boundary with `as never` backed by that authoring-time check.

## Goals / Non-Goals

**Goals:**

- No stringly-typed scene references anywhere: every scene crosses into the CLI as an imported, already-type-checked value.
- A scene with resources is renderable and previewable through the CLI, with missing loaders caught at authoring time (compile), not frame time.
- Net deletion: config discovery/validation/precedence, the studio glob, and the watcher plugin all go away.
- Studio hot reload rides Vite's ordinary import-graph HMR.

**Non-Goals:**

- CLI flag overrides for render settings (deliberately removed; code is the config — a render.ts may read `process.argv` itself if it wants knobs).
- Zero-registration scene preview (the glob). Explicit registration is the feature, not a cost.
- Multi-container output formats, watch-mode rendering (unchanged scope from the old CLI).

## Decisions

### D1: Entrypoint files over a config file

`render.ts` and `studio.ts` are the units the CLI consumes. Type enforcement happens in those files, where the scenes' literal types are in scope; the CLI executes/imports already-validated values. This is the third application of the same seam pattern (makeScene's erasure cast; the Player's renderLayers; the docs registry).

- *Alternative — keep motion.config.ts and add a `layers` field*: rejected; layers must be typed against the scenes' union, which a path-string config cannot express.

### D2: `studio.ts` — record of scenes, one union layer

```ts
export default studioConfig({
	scenes: {
		"hello-world": helloWorld,                       // bare scene
		orbit: { scene: orbit, fps: 30, autoPlay: true }, // entry with player options
	},
	layers: Layer.mergeAll(Font.layer(Pacifico, …), Image.layer(Rocket, …)),
});
```

- A RECORD, not an array: keys are the unique picker identifiers (duplicates impossible by construction) and survive to runtime, which a bare array of unlabeled scene values cannot do.
- Entry values are `Scene.AnyScene | { scene } & PlayerOptions` where PlayerOptions is the `PlayerProps` subset (`fps`, `autoPlay`, `defaultRepeatMode`, `isInfinite`, `prebufferedFrames`, `bufferCapacity`, `settings`) — typed against the real `PlayerProps`, replacing the studio app's hand-copied mirror.
- `layers` is typed `Layer<ResourcesOfAll<Scenes>>` where the union is extracted per entry (`Scene.Resources` distributes); conditionally required exactly like `PlayerProps.renderLayers` (forbidden when the union is `never`). Forgetting one scene's font fails compilation naming the loader.
- One shared layer is the preload-all-provided policy applied studio-wide: every declared asset loads at mount; scene switches never wait on a fetch.
- The helper is an identity function returning a branded value (`StudioConfigTypeId`); the module stays browser-safe (the studio app imports it directly, the same constraint the old `Config.ts` honored).
- Display labels: `scene.name ?? record key` (see D4).

### D3: `render.ts` — a program, executed by a thin CLI

The file calls the render API normally; `Video.render`'s own signature demands the scene's loaders in `R`, so the loader half of the contract is compile-checked with zero CLI machinery. Contract with the CLI: `render.ts` default-exports an unrun Effect; `motion render [file]` (default `./render.ts`) loads it via the shared Vite pipeline, provides the Node platform services (`NodeServices` — which carries `ChildProcessSpawner`), runs it, and renders failures through the CLI's error path. The file is ALSO runnable standalone (`tsx render.ts`) by self-providing `NodeServices` — document both; the CLI adds consistent TS resolution and error rendering, not magic.

- *Alternative — a `renderEntry()` helper pinning the exported effect's R at authoring time*: rejected for now (YAGNI); the un-pinned half of the contract (platform services) fails at run time with Effect's named missing-service defect, which is acceptable and loud. Revisit if it bites.
- *Alternative — `motion render` accepts studio.ts entries as render targets*: rejected; it reintroduces output/frames/dpr config fields into studioConfig and walks back toward motion.config. Studio is preview props; render is a program.
- Multiple outputs: ordinary code (several `Video.render` calls, loops). No target orchestration, name derivation, or per-target failure summaries in the CLI — a failing effect is a failing command.

### D4: Named scenes — `Scene.make(name?, generator, meta?)`

`Scene.make` gains an overloaded leading display name: `Scene.make("The Scene", function* () {…}, meta?)` alongside the existing `(generator, meta?)`. The scene value carries `readonly name?: string`. The name is DISPLAY-ONLY — the studio record key remains the unique identifier (names may collide; keys cannot). Existing scenes need no migration.

### D5: `motion studio [file]` — positional entrypoint, no discovery

Default `./studio.ts` relative to cwd; absent → error with a scaffold hint. No upward config walk (`findConfig` deleted). Multiple studio setups are multiple files picked by argument — which also enables same-scenes-different-layers configs (e.g. previewing a `"sans-serif"` override). The studio app receives the entrypoint via the generated `project.ts` (absolute path import through `/@fs`, as today) and imports it as one typed module; with every scene in that import graph, Vite HMR covers scene edits/adds/removes and the `motion:project-watch` plugin is deleted.

### D6: `Resource.fetchBytes` memoizes per URL

The Player builds a runtime per mount, so studio scene switches re-run layer loads. Asset bytes are immutable; `fetchBytes` keeps a module-level `Map<url, Promise<Uint8Array>>` (the `loadDefaultBytes` pattern), evicting on failure so a transient error can retry. Custom load effects remain the user's responsibility to cache (documented).

## Risks / Trade-offs

- [Render platform half of the contract is unchecked at compile time (D3)] → Effect's missing-service defect names the service; documented; a helper can be added later without breaking files.
- [Losing `--seed`/`--dpr` exploration workflows] → deliberate; render.ts can read its own argv; noted in cli.mdx migration section.
- [studioConfig record with heterogeneous scene types needs careful generic inference (per-entry Resources extraction over `Scene.AnyScene | {scene}` values)] → same machinery family as PlayerProps, covered by type-level tests for: union coverage required, layers forbidden when never, entry-vs-bare polymorphism.
- [Deleting the `motion-config` capability spec will hit the archive validator's empty-spec check] → delete `openspec/specs/motion-config/` manually at archive time (scene-metadata precedent).
- [Template/tests/fixtures churn: cli tests currently build on config fixtures] → rewritten as entrypoint fixtures; `.claude/launch.json` `motion-studio` entry updated to pass the fixture studio.ts.

## Migration Plan

Single change, no compatibility window (consistent with typed-resource-loaders): land `Scene.make` name + `fetchBytes` memo (motion), then `studioConfig` + studio command/app rewrite, then render command rewrite + Config/ConfigLoader deletion, then template/docs/fixtures. Rollback is `git revert`.

## Open Questions

None — record-vs-array, scene naming, render execution shape, and fetchBytes memoization were settled in exploration with the author.
