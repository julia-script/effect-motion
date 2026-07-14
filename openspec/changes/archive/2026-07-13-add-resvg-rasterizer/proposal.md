# Proposal: add-resvg-rasterizer

## Why

Scenes only exist inside the browser player; nothing can turn a frame into a shareable artifact. The export pipeline's first two stages need (1) confidence that the SVG string sink really is equivalent to the DOM sink the player uses — today only a single-circle test asserts agreement — and (2) an offline rasterizer. A spike validated that resvg (`@resvg/resvg-js` 2.6.2) covers the renderer's entire emitted SVG surface, so rasterization can consume the string sink's output directly.

Rasterization is deliberately NOT a renderer. Renderers (`Renderer.make` families) map a frame to a portable, serializable description — SVG string, SVG DOM, one day Lottie JSON — and stay pure and cross-platform. Export tools consume those descriptions and produce artifacts: resvg turns an SVG string into PNG bytes, and the upcoming ffmpeg stage turns a *stream* of PNGs into a video, which no per-frame `render()` contract can express. Wrapping resvg as a composable function keeps one taxonomy that survives the whole pipeline.

## What Changes

- **Sink parity, specced and tested:** the string sink and DOM sink SHALL produce equivalent output — same tags, attributes, and tree structure — for the full built-in shape surface, not just one shape.
- **New export-tools package** (`@effect-motion/export`, Node-only): native/tool wrappers live here, never in the browser-safe core. resvg is the first tool; ffmpeg joins in a later change.
- **`Resvg.rasterize(svg, options)`:** a thin Effect wrapper over resvg — SVG string in, PNG bytes (`Uint8Array`) out, failures as a tagged `RasterizeError`. Composes after `SvgRenderer.render`; entity renderers registered for the string sink work unchanged because the string sink does all the rendering.
- **`Resvg.rasterizeToFile(svg, path, options)`:** same, but persists via the `effect/FileSystem` service (consumer-provided implementation, e.g. `@effect/platform-node`; `FileSystem.layerNoop` in tests) — no direct `node:fs`.
- Font handling: resvg font options pass through; the generic-family bold/italic limitation is the separate `add-text-font-fallback` change.
- Out of scope: frame loops / numbered sequences, ffmpeg encoding, custom fonts for the browser player, extracting renderers into their own package (roadmap material).

## Capabilities

### New Capabilities

- `resvg-rasterization`: turning SVG document strings into PNGs via resvg, as composable Effect functions with buffer and file outputs.

### Modified Capabilities

- `svg-rendering`: the sink-agreement expectation strengthens from a single-shape spot check to a requirement covering the full built-in shape surface.

## Impact

- New `packages/export` (`@effect-motion/export`), depending on `effect` (pinned to the 4.0.0-beta version, matching the react package's convention) and `@resvg/resvg-js`; no dependency on `effect-motion` needed — it consumes plain SVG strings.
- `packages/motion/test/`: new sink-parity test over the full shape surface (no source change expected).
- Workspace config picks up the new package (`pnpm-workspace.yaml` already globs `packages/*`).
- Roadmap: answers the export item's binding question (napi, validated on macOS) and settles the renderer-vs-tool taxonomy for the ffmpeg stage.
