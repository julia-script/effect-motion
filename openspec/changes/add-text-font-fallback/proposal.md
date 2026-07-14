# Proposal: add-text-font-fallback

## Why

The SVG renderer emits `font-family="sans-serif"` verbatim (the `Shapes.Text` default). Browsers resolve generic families with full bold/italic variant matching, but resvg — the planned offline rasterizer for the video export pipeline — resolves a lone generic family to a single face and silently drops `font-weight`/`font-style`, so the rich-text spans that just shipped render as regular text in exported frames. Verified against `@resvg/resvg-js` 2.6.2: named families (even first in a fallback list) restore correct variants; generic-only families do not, and resvg's `sansSerifFamily` remap option doesn't help either.

## What Changes

- The SVG text renderer expands a lone generic `font-family` (`sans-serif`, `serif`, `monospace`) into a named-first fallback list that ends with the original generic (e.g. `sans-serif` → `Helvetica, Arial, sans-serif`).
- The `Shapes.Text` schema and its `"sans-serif"` default are untouched — entity data stays semantic; the expansion happens at render time, in the shared render function, so both sinks (DOM and string) emit identical markup.
- Any user-provided `fontFamily` that is not exactly a lone generic keyword passes through unchanged.
- Browser/offline rendering differences that remain (metric drift between the named faces each platform resolves) are accepted and documented over time, not eliminated by this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `text-entity`: the SVG rendering requirement changes — generic font families are expanded to a named-first fallback list in the emitted `font-family` attribute.

## Impact

- `packages/motion/src/svg/shapes.ts`: expansion map + application in the `text` render function.
- `packages/motion/test/text.test.ts`: cover default expansion, each generic keyword, and pass-through of named/list values.
- No API change, no new dependency, no player change.
