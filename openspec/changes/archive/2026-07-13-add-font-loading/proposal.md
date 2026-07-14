# Proposal: add-font-loading

## Why

Text entities can name any `fontFamily`, but nothing makes those names resolve: the player silently falls back when a named font isn't installed, and resvg-based export renders wrong glyphs (or drops variants) for fonts it can't find. The `add-text-font-fallback` design explicitly deferred custom font loading as the piece that makes browser and offline output converge — scenes need a way to declare the fonts they use, and each rendering environment needs a defined way to honor that declaration.

## What Changes

- A scene declares its fonts via a `Fonts` annotation on the existing scene-metadata mechanism (`scene.annotate(Fonts.Fonts, [...])`). Each entry names a `family` plus per-environment sources (`url` for browsers, `path` for offline rasterization) and optional `weight`/`style`. The runtime never reads it — fonts cannot affect frame data.
- The shared SVG render functions are untouched: markup only ever *names* families; both sinks keep emitting identical output. Font loading happens around rendering, per environment.
- `usePlayer` (and therefore `<Player>`) reads the annotation and loads `url` entries through the browser `FontFace` API before reporting `'ready'`, so the first visible frame is drawn with the declared fonts. Individual font failures do not fail playback.
- `@effect-motion/export` gains a helper that maps the annotation's `path` entries to resvg's `fontFiles` option, so exported frames rasterize with the same families the player displayed.

## Capabilities

### New Capabilities

- `font-loading`: scene-level font declaration (the `Fonts` annotation) and the per-environment loading contracts — browser player loads by URL, export feeds files to resvg.

### Modified Capabilities

None. Existing `react-player`, `resvg-rasterization`, `scene-metadata`, and `text-entity` requirements are unchanged; the new behavior is specified entirely under `font-loading`.

## Impact

- `packages/motion`: new `Fonts` module (font resource type + annotation key + accessor). No runner, renderer, or shape changes.
- `packages/react`: `usePlayer` gains a font-loading step before `'ready'`.
- `packages/export`: helper translating a scene's font declaration to `ResvgRenderOptions["font"]`.
- No new dependencies. No API breakage — scenes without the annotation behave exactly as today.
