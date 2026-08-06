---
"@effect-motion/ide": minor
---

New package: `@effect-motion/ide`, editor support for effect-motion.

It ships two things from one folder. A **VS Code extension**: a TextMate
injection grammar that scopes the strings a scene is written with (easing
names, spring presets, entity tags, duration values) plus the authoring
calls themselves; curve previews on hover, plotted from the real
`effect-motion/Timing` functions; spring hovers that run the engine's own
integrator and report the frames a preset occupies; frame counts on
duration strings; colour swatches and a constructor-preserving picker for
`Color.hex` / `rgba` / `hsl` / `lab` / `oklch` / `tw`; completions carrying
those previews in the documentation window; an easing gallery webview; and
studio/render code lenses that run the CLI through the workspace's own
package manager.

And an **editor-agnostic library** — the catalogs, the source scanners, the
curve plotter, and the paths to the shipped grammar and snippet files —
with no editor API in it, so another editor's integration or the docs site
can build on the same data.

Nothing is re-derived without a check: curves are sampled from `Timing`
itself, the spring integrator is verified against a real scene run through
`Physics.springTo`, and the preset table, entity catalog, grammar name
lists, and Tailwind palette are all asserted equal to the engine's own.
