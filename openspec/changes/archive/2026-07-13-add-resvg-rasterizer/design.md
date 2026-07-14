# Design: add-resvg-rasterizer

## Context

The player renders frames through `SvgDomRenderer`; the string sink (`SvgRenderer`) folds the same `SvgNode` descriptions into a document string. Both are built from one shared entity-renderer registry, so parity is structural by construction — but only a single-circle test asserts it. A spike confirmed `@resvg/resvg-js` 2.6.2 (napi binding) parses and rasterizes the renderer's full emitted surface with zero warnings on macOS; the one caveat found (generic-family bold/italic) is handled by `add-text-font-fallback`.

Effect is pinned to `4.0.0-beta.94`, which bundles `effect/FileSystem` (service interface + `layerNoop`); the Node implementation lives in `@effect/platform-node@4.0.0-beta.*`.

## Goals / Non-Goals

**Goals:**
- A specced, tested guarantee that string and DOM sinks agree across every built-in shape.
- SVG string → PNG as a plain composable Effect function, Node-side.
- A taxonomy that survives the ffmpeg stage: renderers produce serializable descriptions; export tools consume them.
- Filesystem access only through the `effect/FileSystem` service; native deps never enter the browser-safe core.

**Non-Goals:**
- Frame sequences, numbered output, encoding (the ffmpeg change).
- Custom font loading for the browser player (roadmap: Custom fonts).
- Pixel parity between browser and resvg output (accepted drift, documented over time).
- Moving `SvgRenderer`/`SvgDomRenderer` out of `effect-motion` into a renderers-only package — worth considering when a second description format (Lottie) exists; roadmap material, not this change.

## Decisions

**resvg is an export tool, not a renderer.** Renderers (`Renderer.make` families) are `frame → portable description`: pure, serializable, cross-platform (SVG string, SVG DOM, future Lottie JSON). Export tools are description → artifact and get native deps, error channels, and I/O. The ffmpeg stage forces this split: encoding aggregates a *stream* of frames into one file, which the per-frame renderer contract cannot express — so a `ResvgRenderer` would have been a one-off shape with no sibling. Alternative rejected: a renderer-per-tool taxonomy (`ResvgRenderer`, `FfmpegRenderer`, …) that breaks at stage 3 and duplicates renderer resolution machinery a plain function doesn't need.

**API: two functions in a `Resvg` module.**
- `rasterize(svg: string, options?): Effect<Uint8Array, RasterizeError>` — wraps the synchronous resvg call in `Effect.try`, tagging failures.
- `rasterizeToFile(svg: string, path: string, options?): Effect<void, RasterizeError | PlatformError, FileSystem>` — `rasterize` + `FileSystem.writeFile`.

Composition with the existing renderer is the usage pattern, not a wrapper API:
```ts
const svg = yield* renderer.render(frame, {})
const png = yield* Resvg.rasterize(svg)          // or rasterizeToFile(svg, path)
```
Custom entities work for free — the string sink does all the rendering. Alternative rejected: a `rasterizeFrame(frame, config)` convenience that resolves `SvgRenderer.Context` internally — it re-creates the renderer-shaped API this change exists to avoid, to save two lines.

**One `@effect-motion/export` package, not one package per tool.** resvg-js is the only heavy native dep; the ffmpeg wrapper will drive a system binary and adds nothing to install weight, so splitting packages buys isolation nobody needs. `packages/export`, Node-only, pinned `effect` dependency (matching the react package's convention), dep `@resvg/resvg-js@^2.6.2`. It does not depend on `effect-motion` — it consumes plain strings, which also means it's usable on any SVG, not just ours. Alternative kept open: split later if ffmpeg's presence ever burdens resvg-only consumers.

**`FileSystem` is required, consumer-provided.** `@effect/platform-node`'s layer in real use, `FileSystem.layerNoop` in tests. The package depends on the service, never on an implementation — Effect-style, and it keeps the door open for bun/deno runtimes.

**Options pass through untranslated.** resvg's `font` options (`loadSystemFonts`, `fontFiles`, `fontDirs`, `defaultFontFamily`) and `fitTo` go straight through — the spike showed fonts are where control matters, and inventing our own vocabulary over resvg's would go stale. Output size comes from the SVG document itself (the string sink already stamps frame `width`/`height` on the root), so no size options are duplicated here.

**Failures are tagged errors, not defects.** `RasterizeError` wraps whatever resvg throws. Failures surface through user-influenced input (fonts, hand-written SVG) often enough that a typed error is the honest channel.

**Parity test method:** render one frame containing every entry in the built-in coverage manifest (all 8 shapes, nested group, path with offset, plain + rich text with alignment props) through both sinks; parse the string sink's output in the test DOM and compare element-by-element (tag, attributes, text) against the DOM sink's target. Canonical comparison, not string equality — the DOM legitimately normalizes attribute order.

## Risks / Trade-offs

- [`@effect/platform-node` beta pin drifts against `effect` beta] → the package never imports it; only docs/tests reference it, and the roadmap maintenance item already tracks the beta-pin risk.
- [resvg-js prebuilt binaries missing on some platform/arch] → napi prebuilds cover mac/linux/win x64+arm64; the package is documented Node-only. A wasm fallback can sit behind the same two functions if it ever matters.
- [Font availability differs across machines] → default `loadSystemFonts: true` mirrors resvg; deterministic exports need explicit `fontFiles`, formalized later by the Custom fonts roadmap item.

## Open Questions

- None blocking. Package name `@effect-motion/export` follows the react package's scope; the roadmap's unscoped-vs-scoped publish question doesn't affect this change.
