# Proposal: IDE support package

## Why

Scenes are ordinary TypeScript, so the language service already carries the load an editor integration usually justifies itself with: entity tags, easing names, and spring presets are string-literal unions, `Scene.instantiate` autocompletes them, and a typo is a compile error. There is nothing to gain by re-implementing that.

What tsserver structurally cannot do is *show* anything. `"easeOutBack"` overshoots and comes back, `"bounce"` rings for twelve seconds before it settles, `"400 millis"` is 24 frames, and `Color.hex("#7f5af0")` is violet — none of which a type can express and all of which an author needs while pacing a scene. Today that means leaving the editor for the docs, or rendering to find out.

The gap is worth closing as a package rather than a docs page because the answers are computable from the library itself: sample the real `Timing` function to draw its curve, run the engine's own integrator to count a spring's frames, resolve the same chroma call the renderer resolves to paint a swatch. That gives previews that cannot drift from what renders, which is the same property the rest of the project holds itself to.

Shipping it as one package with two faces — a VS Code extension and an editor-agnostic library — keeps a second editor's integration (or the docs site) from vendoring a copy of the catalogs that goes stale.

## What Changes

- New workspace package `packages/ide`, published to npm as `@effect-motion/ide` and packageable as a VS Code extension from the same folder (`vsce` reads the contribution fields; npm reads `exports`/`files`).
- **A TextMate injection grammar** (`assets/syntaxes/`) scoping the strings a scene is written with — easing names, spring presets, entity tags, and a duration's value and unit — plus namespace-qualified authoring calls (`Scene.instantiate`, `Motion.moveTo`, `Physics.springTo`, `Camera.orbitTo`, …).
- **Snippets** (`assets/snippets/`) for the shapes authors write most: a whole scene, each entity, each animator, the composition combinators, and the two entrypoints.
- **Hovers**: easing curve previews plotted from `effect-motion/Timing` itself; spring previews that run a mirror of the engine's integrator and report frames and seconds; duration strings reported in frames; entity tags described with their own and shared fields.
- **Colour swatches and a picker** for `Color.hex` / `rgba` / `hsl` / `lab` / `oklch` / `tw`, preserving the constructor on edit (`tw` falls back to `hex`, which its closed palette forces).
- **Completions** carrying those previews in the documentation window, offered only in the argument position that accepts them.
- **An easing gallery webview** and a quick pick, for comparing curves rather than reading one at a time.
- **Code lenses** running `motion studio` / `motion render` through the workspace's own package manager.
- **An editor-agnostic library** (`Easings`, `Springs`, `Colors`, `Durations`, `Entities`, `Imports`, `Scenes`, `CallContext`, `Docs`, `Assets`) with no editor API in it.
- A docs page under Going Further, and a fix to `Color.twMap.slate` (a verbatim copy of `fuchsia`), found while generating the palette the swatches use.

## Capabilities

### New Capabilities

- `ide-support`: editor integration for effect-motion — the injection grammar and snippets, curve/frame/colour previews computed from the library rather than restated, the source scanners behind them, and the catalogs published as plain data for non-VS-Code consumers.

### Modified Capabilities

- None. No existing package's behaviour changes; `packages/motion`'s `Color.twMap.slate` is a data correction, not an interface change.

## Impact

- **New**: `packages/ide` (grammar, snippets, library, VS Code layer, tests, generated Tailwind palette, extension icon).
- **New**: `apps/docs/content/docs/going-further/editor-support.mdx`, registered in that section's `meta.json`.
- **Modified**: `packages/motion/src/Color.ts` — `twMap.slate` corrected to Tailwind's slate values.
- **Unchanged**: every other package, the release workflow, the CLI's commands.
- **Dependencies**: runtime `chroma-js` (the library the core already resolves colours with) and `effect-motion` (for `Timing`, which is import-free — the extension bundle stays ~150 KB). Dev-only `@types/vscode`, `esbuild`, `effect` (tests), `@types/chroma-js`.
- **Membership**: `@effect-motion/ide` matches the `@effect-motion/*` pattern already in the changesets `fixed` group, so it versions in lockstep with no config change.
