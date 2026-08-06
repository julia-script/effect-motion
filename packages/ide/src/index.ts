/**
 * @effect-motion/ide — editor support for effect-motion.
 *
 * @remarks
 * Two things ship in this package, and they are deliberately separable:
 *
 * - **A VS Code extension.** Install it and effect-motion scenes gain a
 *   TextMate injection grammar, snippets, colour swatches on `Color.*`
 *   constructors, curve previews when hovering an easing or a spring
 *   preset, frame counts on duration strings, and studio/render code
 *   lenses.
 * - **This library.** Everything the extension knows, with no editor API in
 *   sight: the catalogs, the scanners, the curve plotter, and the paths to
 *   the shipped grammar and snippet files. A different editor's integration
 *   — or the docs site — can build on it directly.
 *
 * Nothing here loads a TypeScript program or talks to the compiler. The
 * language service already types scenes; what it cannot do is draw the
 * curve behind `"easeOutBack"`, and that gap is what this fills.
 *
 * @example
 * ```typescript
 * import * as Easings from "@effect-motion/ide/Easings";
 *
 * const svg = Easings.curveSvg("easeOutBack", { theme: Easings.lightTheme });
 * ```
 *
 * @packageDocumentation
 */

// the grammar and snippet files, for editors that are not VS Code
export * as Assets from "./Assets.js";
// where the cursor sits inside an effect-motion call
export * as CallContext from "./CallContext.js";
// finding and rewriting Color.* constructors in source text
export * as Colors from "./Colors.js";
// the markdown and HTML an editor renders
export * as Docs from "./Docs.js";
// duration strings, and what they cost in frames
export * as Durations from "./Durations.js";
// the easing catalog, and drawing its curves
export * as Easings from "./Easings.js";
// the closed entity world, described
export * as Entities from "./Entities.js";
// which identifiers effect-motion is reachable through in a file
export * as Imports from "./Imports.js";
// scene declarations and entrypoints, for code lenses
export * as Scenes from "./Scenes.js";
// the spring presets, and the simulation that gives them length
export * as Springs from "./Springs.js";
