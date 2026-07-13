# Add frame render metadata

## Why

A `Frame` today is only `{ instances, root }` — a consumer holding a frame (a video encoder, an SVG sink, a custom renderer) has no way to know the scene's frame rate or the intended output resolution. Renderers work around this by requiring width/height as separate config on every render call, and fps is simply unavailable at the frame level.

## What Changes

- `Runner.Settings` gains `width` and `height` (the scene's resolution) with defaults, alongside the existing `frameRate`.
- Every emitted `Frame` carries `frameRate`, `width`, and `height`, taken from the runner settings — a frame is self-describing for rendering.
- SVG sink configs (`SvgRenderer`, `SvgDomRenderer`) make `width`/`height` optional: omitted values fall back to the frame's own resolution. Explicit config still overrides (backward compatible).
- The generic `Renderer.make` sink render function gains access to the frame's metadata so custom sinks can use it too.

## Capabilities

### New Capabilities
- `frame-metadata`: frames carry frameRate/width/height from runner settings; settings define the scene resolution with defaults.

### Modified Capabilities
- `svg-rendering`: String sink and DOM sink requirements change — width/height in config become optional overrides, defaulting to the frame's resolution.

## Impact

- `packages/motion/src/Runner.ts` — settings shape and defaults
- `packages/motion/src/Scene.ts` — `Frame` interface, `runner.state` emission
- `packages/motion/src/Renderer.ts` — sink render signature receives frame metadata
- `packages/motion/src/svg/SvgRenderer.ts`, `SvgDomRenderer.ts` — optional width/height
- `packages/react` — unaffected (Player keeps passing explicit width/height, which override)
