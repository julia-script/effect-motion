# Tasks: add-frame-render-metadata

## 1. Settings and Frame

- [x] 1.1 Add `width`/`height` to `Runner.Settings` (packages/motion/src/Runner.ts) with defaults 500/300 in `Runner.make`'s settings resolution
- [x] 1.2 Add `frameRate`, `width`, `height` to the `Frame` interface (packages/motion/src/Scene.ts) and emit them from `runner.state` using the effective settings
- [x] 1.3 Test: a stepped frame from a scene run with explicit `{ frameRate, width, height }` carries those values; defaults apply when unset

## 2. Renderer plumbing

- [x] 2.1 Pass `{ frameRate, width, height }` as a third `meta` argument to the sink render function in `Renderer.make` (packages/motion/src/Renderer.ts)
- [x] 2.2 Make `SvgConfig` width/height optional in SvgRenderer and SvgDomRenderer; resolve size as `config?.width ?? meta.width` (same for height)
- [x] 2.3 Test: rendering with no size config uses frame metadata; explicit config overrides it (string sink assertion on the `<svg>` attributes covers both)

## 3. Verify

- [x] 3.1 Run the motion package test suite and typecheck; confirm react Player and playground compile unchanged (explicit width/height props still override)
