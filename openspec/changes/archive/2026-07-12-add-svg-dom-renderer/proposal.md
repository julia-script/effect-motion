# Add SVG DOM Renderer

## Why

The only way to see a scene today is the string `SvgRenderer` printing to a terminal. To actually watch animations, frames need to render into a live browser DOM. Entity renderers currently return strings, which couples them to one output format — every new renderer type would need a duplicate set of per-entity renderers, growing with every entity type.

## What Changes

- **New `SvgNode` contract**: entity renderers return a serialized node description (`{ tag, props, children }`, recursive) instead of strings. The frame renderer needs zero knowledge of which entity renderers exist — user-defined entities plug in by returning nodes.
- **BREAKING**: the string `SvgRenderer` (currently defined in demo.ts) is promoted to library code and becomes a fold over `SvgNode` (`vnodeToString`); existing string-returning entity renderers in the demo migrate to return `SvgNode`. One entity-renderer set now feeds all sinks.
- **New `SvgDomRenderer`**: renders a frame into a passed HTML element via DOM APIs (`createElementNS`, `append`). Uses the pass-through render config (already supported by `Renderer.make`'s `Config` param) to receive `{ target, width, height }`. v0 strategy is clear-and-rebuild per frame; keyed reconciliation (instance ids are already stable keys) is a later, sink-internal upgrade.
- Namespaces are sink-owned: entity renderers can never touch `createElementNS` / xmlns concerns.
- Positions are absolute within a `width`/`height` viewport passed as config. No coordinate transforms yet — a future camera concept will transform values between frame data and applied props; this change just keeps that seam clean (transforms would slot into the frame render stage, not into entity renderers or sinks).
- **New playground**: minimal vite setup (`playground/index.html` + `main.ts`) with a requestAnimationFrame loop pulling `Scene.step` — one phase per display frame, so scene time locks to wall time (the externally paced phaser needs no throttling).
- Tests for `vnodeToString` and the DOM sink (happy-dom).

## Capabilities

### New Capabilities

- `svg-rendering`: The `SvgNode` contract between entity renderers and sinks, the string sink (`SvgRenderer`), the live DOM sink (`SvgDomRenderer`) with viewport config and clear-and-rebuild semantics.

### Modified Capabilities

<!-- none — `phaser` requirements unchanged -->

## Impact

- New `src/Svg.ts`: `SvgNode` type, `vnodeToString`, `SvgRenderer` (string sink), `SvgDomRenderer` (DOM sink).
- `src/demo.ts`: entity renderers return `SvgNode`; `SvgRenderer` definition moves out into the library.
- `src/index.ts`: export `Svg`.
- New `playground/`: vite + rAF-paced live view. New devDependencies: `vite`, `happy-dom`.
- `src/Renderer.ts`: no changes (the `Config` pass-through already landed).
