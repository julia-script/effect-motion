# Add a simple Text entity

## Why

There is no way to put text in a scene — titles, labels, and captions are table stakes for motion graphics. A minimal entity mirroring SVG `<text>` covers the common cases; rich text (styled runs, wrapping, per-character layout) is explicitly future work and will be a separate entity, so this one can stay a single unstyled run forever.

## What Changes

- New `Shapes.Text` entity: a single-line, single-style text run.
  - `text` (required — empty text can never be visible, same rationale as `Path.d`), the shared `Shape2D.filled` props (`x`, `y`, `fill`, `stroke?`, `strokeWidth?`, `opacity`), `fontSize` (defaulted number — numeric, therefore tweenable via `Motion.tweenTo` with zero new Motion code), `fontFamily` (defaulted to the generic `"sans-serif"` family, guaranteed to resolve on every platform), `textAnchor` and `baseline` (optional literals — they make centered text one prop instead of impossible, since the engine cannot measure text).
  - Standard `~position` and `~opacity` traits: `moveTo`/`fadeTo` work immediately.
- SVG render function for both sinks (string + DOM), registered in `shapesLayer`; text content flows through `SvgNode.children`'s existing string support (escaping already handled by both sinks).
- Documented limitation: the engine has no text measurement (no layout, no fit-to-box, no center-by-math); alignment is delegated to SVG via `textAnchor`/`baseline`.

## Capabilities

### New Capabilities
- `text-entity`: the Text shape, its schema/traits, and its SVG rendering.

### Modified Capabilities

None.

## Impact

- `packages/motion/src/shapes/Text.ts` (new), `shapes/index.ts` (export).
- `packages/motion/src/svg/shapes.ts`: `text` render function + `shapesLayer` registration.
- Docs: shapes/examples coverage with a playable title animation.
- No engine, Motion, or player changes.
