# @effect-motion/ide

Editor support for [effect-motion](https://github.com/julia-script/effect-motion) — a VS Code extension, plus the editor-agnostic assets and catalogs behind it.

Scenes are ordinary TypeScript, so the language service already types them. What it can't do is draw the curve behind `"easeOutBack"`, tell you `"400 millis"` is 24 frames, or show you the colour in `Color.hex("#7f5af0")`. That's the gap this fills.

```sh
# VS Code
code --install-extension julia-script.effect-motion-ide

# or, for another editor / for the catalogs
pnpm add -D @effect-motion/ide
```

## What you get

**A TextMate injection grammar.** The strings a scene is written with stop looking like prose: easing names, spring presets, entity tags, and duration values get their own scopes, and `Scene.instantiate` / `Motion.moveTo` / `Physics.springTo` read as the library calls they are.

**Curve previews on hover.** Hover an easing name and see the curve — plotted from the real `effect-motion/Timing` function, not an approximation — with a note on whether it overshoots, returns to its start, or lands exactly on target. Hover a spring preset and see its simulated curve, its physical parameters, and how many frames it occupies. Hover a duration string and see it in frames.

**Colour swatches.** `Color.hex`, `rgba`, `hsl`, `lab`, `oklch`, and `tw` get an inline swatch and a colour picker. The picker writes back through the same constructor, so nudging an `oklch` call leaves an `oklch` call. Calls whose arguments aren't literals are skipped rather than guessed at.

**Completions with pictures.** Inside the easing argument of a `Motion` animator, the spring argument of a `Physics` animator, or the tag argument of `Scene.instantiate`, every candidate carries its curve or its field list in the documentation window.

**An easing gallery.** `effect-motion: Easing Gallery` opens every curve and every spring side by side — because `easeOutQuart` versus `easeOutQuint` is not a question a name answers. Click one to insert it. `effect-motion: Insert Easing…` is the keyboard version.

**Code lenses.** `▶ Studio` above each scene and above a `studioConfig` entrypoint; `⤓ Render` above a `Video.render` call. They run the CLI through the workspace's own package manager, so you get the project's `motion`, not whatever is on `PATH`.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `effectMotion.frameRate` | `60` | Frame rate used to report durations and spring lengths. |
| `effectMotion.colorDecorators` | `true` | Colour swatches on `Color.*` constructors. |
| `effectMotion.hovers` | `true` | Curve previews and reference notes. |
| `effectMotion.completions` | `true` | Easing / spring / entity completions. |
| `effectMotion.codeLens` | `true` | Studio and render lenses. |
| `effectMotion.packageManager` | `"auto"` | How to invoke the CLI. `auto` reads the workspace lockfile. |

A scene's real frame rate lives in its settings, and this extension deliberately does not evaluate scene code to colour a hover. `effectMotion.frameRate` is the honest stand-in — set it to match your project, and every frame count in a hover says which rate it used.

## Cost in unrelated code

Every provider gates on the document importing effect-motion, so in a file that doesn't, the whole extension is one substring test. The grammar is the exception — a TextMate injection has no way to know what a file imports, so name matching is constrained instead: only strings in argument-terminal position are scoped, and only names from the real catalogs. A `"linear"` or `"bounce"` sitting in some other library's argument list will pick up an effect-motion scope. It still renders as a string; the trade is a slightly different shade there for meaningful colour in every scene.

## Using it outside VS Code

Everything the extension knows is exported as a plain library, with no editor API anywhere in it.

```ts
import * as Easings from "@effect-motion/ide/Easings";
import * as Assets from "@effect-motion/ide/Assets";

Easings.curveSvg("easeOutBack", { theme: Easings.lightTheme }); // standalone SVG
Assets.grammarPath();   // the .json to register in Zed / Sublime / Shiki
Assets.snippetsPath();  // the snippet file
Assets.catalog();       // every easing, spring, and entity as JSON
```

| Module | What it is |
| --- | --- |
| `Easings` | The easing catalog, sampled from the real `Timing` functions, and the curve plotter. |
| `Springs` | The preset table and a faithful mirror of the engine's integrator — frame counts included. |
| `Colors` | Scanning and rewriting `Color.*` constructors in source text. |
| `Durations` | Effect duration strings, and what they cost in frames. |
| `Entities` | The closed entity world, described. |
| `Imports` | Which identifiers effect-motion is reachable through in a file. |
| `Scenes` | Scene declarations and entrypoints, for lenses. |
| `CallContext` | Where the cursor sits inside an effect-motion call. |
| `Docs` | The Markdown and HTML an editor renders. |
| `Assets` | Paths to the shipped grammar and snippets, plus the JSON catalog. |

## Staying in sync

Nothing here re-derives the library's behaviour without checking it:

- easing curves are sampled from `effect-motion/Timing` itself;
- the spring integrator is a mirror, and the test suite runs a real scene through `Physics.springTo` and asserts the frame counts agree;
- the preset table, the entity catalog, and the grammar's name lists are all asserted equal to the engine's own;
- the Tailwind palette is generated from `Color.twMap` (`pnpm sync:palette`) and a test fails when it drifts.

A change to the engine breaks a test here rather than silently shipping a wrong curve.

## Packaging

```sh
pnpm build     # tsc for the library, esbuild for the extension entry
pnpm vsix      # package a .vsix
```

## License

MIT
