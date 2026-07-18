## Context

All runtime pieces of the workflow exist and are published: `Scene.stream` (lazy frames), `@effect-motion/react`'s `Player` (buffered streaming playback), `@effect-motion/export`'s `Video.render` (scene → ThorVG raster → bundled ffmpeg → MP4). The docs site's `*.scene.ts` files establish the authoring shape a scaffold should mirror: a module exporting `scene = Scene.make(...)`. The CLI is glue — its design questions are about contracts (config shape, loading, precedence), not new runtime capability.

Constraints: `effect` is intentionally pinned (`4.0.0-beta.9x`; upgrading changes seeded random sequences), strict TS everywhere, and a stated future direction of multi-project directories that the v1 config shape must not preclude.

## Goals / Non-Goals

**Goals:**
- One command each for scaffold, preview, and render, composing published APIs only.
- A single typed config contract (`motion.config.ts`) shared by studio and render.
- One TypeScript loader (Vite) for user code in every command, so preview and export resolve the same module graph.
- Scaffolded projects pin exact known-good `effect-motion` + `effect` versions.

**Non-Goals:**
- Multi-project directories (shape stays compatible; feature deferred).
- Studio beyond player + scene picker (no timeline, no inspection).
- Watch-mode or incremental rendering; render output caching.
- Changing `effect-motion` / `react` / `export` public APIs.
- A `create-effect-motion` alias package (`npx @effect-motion/cli init` suffices for v1).

## Decisions

### D1: Config is TypeScript, loaded by Vite — and it is the only orchestrator

`motion.config.ts` default-exports `defineConfig({ targets: [...] })` (identity function, Vite/Vitest convention). JSON/YAML would force a parallel stringly-typed settings schema that diverges from the real `Settings` type (e.g. `Color.Color` backgrounds); TS gets typechecking for free.

There is no CLI-special `main.ts`. The scaffold ships `src/main.ts` as an ordinary scene that composes the others via `Scene.chain`, registered as an ordinary target. Killing the magic filename keeps the future multi-project layout a pure config concern (a `projects` array or multiple configs) with nothing to migrate.

Both `render` and config loading go through a Vite server in middleware mode using `ssrLoadModule` — the same Vite instance/pipeline `studio` uses for the browser. Alternative considered: `jiti`/`tsx` for the Node side. Rejected: two resolvers that can disagree about aliases, conditions, and tsconfig is a classic split-brain bug; Vite is already a hard dependency for studio.

### D2: Target shape — `dpr` lives in settings, output is a directory

```ts
export default defineConfig({
  targets: [
    {
      name: "hello-1080p",            // unique; also the output basename
      scene: "./src/scenes/hello-world.ts",
      settings: {                      // Runner Settings subset + dpr
        width: 1920, height: 1080, frameRate: 60, dpr: 2,
        // seed?, maxFrames?, backgroundColor?
      },
      output: "./output",              // directory, not file
      format: "mp4",                   // optional, default "mp4" (v1: mp4 only)
      frames: undefined,               // optional cap for infinite scenes
    },
  ],
});
```

- **`dpr` in settings**: from the author's perspective it is a rendering setting like width/height, even though `@effect-motion/export` models it as `VideoOptions.dpr` beside `settings`. The CLI's config schema owns the ergonomic grouping and maps `settings.dpr` → `VideoOptions.dpr` internally; no export-package change.
- **Output directory + derived filename**: the file name is fully inferable — `<output>/<name>.<format>` (e.g. `output/hello-1080p.mp4`). A per-target file path is redundant state and wrong-by-default once formats multiply. Target `name` doubles as the basename, so names must be unique (validated at config load).
- The scaffold's output dir is `output/` at the project root, a sibling of `src/` (gitignored). Generated binaries inside `src/` would sit in Vite's watch scope and confuse "source vs artifact".

### D3: Built on Effect's own Command API (`effect/unstable/cli`), idiomatic Effect throughout

The pinned `effect 4.0.0-beta.98` ships a complete CLI toolkit *inside the `effect` package* at `effect/unstable/cli`: `Command.make`/`withSubcommands`/`run`, `Flag`, `Argument`, `HelpDoc` (help/version for free), and a `Prompt` module (`text`, `select`, `confirm`) that covers the entire init wizard. So there is no separate `@effect/cli` to version-match and no reason for `parseArgs`/`@clack/prompts` — the earlier concern (a framework dependency that must align with the beta pin) doesn't exist when the framework ships in the already-pinned package. Alternatives (stdlib `parseArgs` + `@clack/prompts`) rejected: they'd add a dependency and a second idiom to a codebase that is Effect end-to-end.

The whole CLI is idiomatic Effect: each subcommand handler is an `Effect.gen` program; filesystem, path, and process access go through the platform services (`FileSystem`/`Path` from `effect/platform`, provided by `@effect/platform-node`'s Node layers, with `ChildProcessSpawner` for the install step — the same service `@effect-motion/export` already uses for ffmpeg); resources like the Vite dev server are `Effect.acquireRelease`-scoped so Ctrl-C tears them down through fiber interruption. No ad-hoc `process.exit` in handlers — failures propagate as typed errors to the single `Command.run` boundary.

The `unstable/` namespace means the API may shift between effect betas — acceptable because the CLI pins the exact effect version (D4 pins it for scaffolds; the workspace pin covers the CLI itself), so it never floats onto a breaking beta.

### D3a: One tagged error type across the CLI

All CLI failures are a single `Data.TaggedError`-based type exported from the package, e.g. `MotionCliError` with a `reason` discriminant (`ConfigNotFound`, `ConfigInvalid`, `SceneLoadFailed`, `UnknownTarget`, `ScaffoldTargetNotEmpty`, `InstallFailed`, `RenderFailed`, …), a human-readable `message`, and an optional `cause` capturing the wrapped upstream error (Vite load errors, `Ffmpeg.EncodeError`, `ThorvgException`, platform errors). Every command handler's error channel is `MotionCliError` — upstream errors are caught and wrapped at the point of use (`Effect.mapError`/`catchTag`), never re-thrown raw.

Why one type with a `reason` field rather than a family of tagged classes: the CLI's error channel then stays a single name in every signature, exhaustive handling happens at exactly one place (the top-level renderer that formats `reason`+`message`+`cause` for the terminal and sets the exit code), and adding a failure mode is a union-member addition the compiler tracks. The `cause` chain preserves full diagnostic detail (`--verbose` prints it) without leaking stack traces into normal output. This mirrors the repo's "failures are loud and name the offender" invariant: every wrap site must fill `message` with the offending file/target/path.

### D4: `init` scaffolds from embedded templates and pins exact versions

- Prompts: target directory (`.` → current directory, project name = `basename(resolve(dir))`), then package manager (pnpm/npm/yarn/bun; detected from the running `npm_config_user_agent` as the default choice). Non-empty directory → refuse unless empty-ish (same rule create-next-app uses).
- Templates are plain files shipped in the package (`templates/default/`), copied with `{{name}}`-style substitution in package.json only. No templating engine.
- Generated `package.json` pins **exact** versions of `effect-motion`, `@effect-motion/react`, `@effect-motion/export`, and `effect` — the effect pin is a determinism invariant (seeded sequences), so "latest effect-motion" means "the exact pair the CLI release was tested with", baked into the CLI at its own release time as constants. `latest` tags are never used.
- The scaffolded `hello-world.ts` mirrors a docs example (`Scene.make`, a couple of tweens) so docs and scaffold stay one idiom.
- Runs the chosen package manager's install at the end (skippable with `--no-install`).

### D5: `studio` — Vite dev server + a host app shipped inside the CLI

The CLI ships a tiny prebuilt host app (React, mounts `Player`). `motion studio` starts Vite with the project root as the served root, injecting the host via a virtual entry; scene modules are discovered as (a) config targets and (b) unregistered `src/scenes/*.ts` files — preview must not require registration, render does. Scene selection is a client-side picker; selecting a scene dynamically imports its module, so Vite's HMR/full-reload on scene edits comes for free. v1 accepts full-reload semantics on edit (a scene is a generator run from frame 0; there is no meaningful partial-HMR state to preserve). `--port`/`--host` flags pass through to Vite.

Player renders via SVG DOM; `render` rasterizes via ThorVG. This preview/export divergence (fonts especially) is accepted for v1 and stated in the studio docs — the upgrade path is a ThorVG-WASM preview sink, out of scope here.

### D6: `render` — config resolution and precedence, tsc-style

Resolution order for the config: `--config <path>` → nearest `motion.config.ts` walking up from cwd → error (unless a positional scene file is given). Modes:

- `motion render` — all targets in the config.
- `motion render <name...>` — only the named targets (error on unknown names).
- `motion render ./src/scenes/foo.ts` — configless: renders that scene module with default settings to `./output/<scene-basename>.mp4`.
- Flag overrides: `--width --height --fps --dpr --seed --max-frames --frames --out-dir --format`, applied on top of whichever mode is active.

Precedence (highest wins): CLI flags → target config → Runner `Settings` defaults (500×300@60, default seed). Overrides applied to *multiple* targets apply to each — same semantics as tsc flags over a tsconfig. Each target is rendered sequentially (ffmpeg is already CPU-saturating; parallel targets would thrash — `ponytail:` sequential, parallelize when profiling says otherwise). Exit non-zero if any target fails; keep rendering remaining targets, then report a per-target summary.

## Deviations discovered during apply

- **`PlayerProps.settings` (additive change to `@effect-motion/react`).** The Player hardcoded `Scene.run(scene, { frameRate: fps })`, so "registered scenes preview with their target settings" was unimplementable from outside. Added an optional `settings` prop (a `settings.frameRate` wins over the `fps` prop so the playback clock and the scene agree on one rate). Non-breaking; contradicts the proposal's "core packages not modified" narrowly and deliberately.
- **Node-ESM import specifiers across all packages.** Every workspace package emitted extensionless relative imports (`from "./Ffmpeg"`), which bundlers resolve but raw Node ESM rejects — the CLI bin is the first consumer in the repo to run `dist/` under plain Node, and it crashed immediately. Root fix over masking: all relative imports in `motion`/`export`/`thorvg`/`react` sources now carry `.js` (directory imports became `/index.js`), making the published packages consumable from plain Node at all. Mechanical sweep (52 files), no logic changes; full test suite green (one pre-existing phaser flake, present on clean checkout).
- **Studio app location: `.motion/studio/` in the project, not inside the CLI package.** Copying the app into the project makes every bare import (react, @effect-motion/react, the config's own imports) resolve against the project's node_modules — the same graph render uses — with zero alias gymnastics. Because the project files live outside the Vite root, the studio command watches `src/` + `motion.config.ts` explicitly and a tiny plugin invalidates + full-reloads on scene file add/remove (vite's built-in glob invalidation doesn't reach out-of-root dirs).
- **Picker identity is the target, not the file.** Two targets can share one scene module (e.g. same scene at two resolutions); the picker keys registered entries by target name and lists scenes-dir files without a referencing target separately.

## Risks / Trade-offs

- [Vite as Node-side loader couples render to Vite internals (`ssrLoadModule`)] → It is a stable, widely used API (Vitest, many CLIs); pin Vite as a regular dependency of the CLI, not a peer.
- [Preview (SVG DOM) and export (ThorVG) can differ visually] → Accepted v1 limitation, documented; ThorVG-WASM preview sink is the known upgrade path.
- [Scaffold pins go stale as packages release] → Pins are constants in the CLI updated by its own release process; a stale CLI still produces a *working* (older) project, never a broken one.
- [`settings.dpr` in config diverges from `VideoOptions` shape in export] → Divergence is contained in one mapping function in the render command; if export later moves `dpr` into its settings, the mapping collapses.
- [Windows support (paths, bin shims, ffmpeg-static)] → `ffmpeg-static` ships win32 binaries; use `node:path` throughout; no shell-quoting (spawn with arg arrays). Untested on Windows in v1 — noted, not blocking.

## Open Questions

- Template default resolution: scaffold `settings` at 1920×1080@60 (video-first) or the library default 500×300 (docs-first)? Leaning 1920×1080 with `dpr: 1` — it's a video tool.
- Should `studio` read `settings` from the matching config target when previewing a registered scene (so preview aspect matches export)? Leaning yes if cheap; player already sizes from frame metadata.
