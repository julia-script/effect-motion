# Tasks: add-resvg-rasterizer

## 1. Sink parity

- [x] 1.1 Add a parity test in `packages/motion/test/` rendering one all-surface frame (all 8 built-in shapes, nested group, path with offset, plain + rich text with alignment props) through both sinks, parsing the string output and comparing element-by-element against the DOM sink's target
- [x] 1.2 Fix any divergence the test surfaces (none expected — sinks share the entity-renderer registry)

## 2. Package scaffold

- [x] 2.1 Create `packages/export` (`@effect-motion/export`) mirroring `packages/react`'s build/test setup: peer `effect` (4.0.0-beta pin), dep `@resvg/resvg-js@^2.6.2`; no `effect-motion` dependency
- [x] 2.2 Verify workspace tooling picks it up (install, typecheck, test wiring)

## 3. Resvg module

- [x] 3.1 Implement `RasterizeError` (tagged) and the options type (resvg `font`/`fitTo` passthrough)
- [x] 3.2 Implement `Resvg.rasterize(svg, options?)`: resvg call in `Effect.try`, failures tagged, PNG bytes returned
- [x] 3.3 Implement `Resvg.rasterizeToFile(svg, path, options?)`: `rasterize` + `FileSystem.writeFile`
- [x] 3.4 Export the module, options type, and error from the package index

## 4. Tests

- [x] 4.1 Buffer test: string-sink output of an all-surface frame rasterizes to bytes with PNG signature and frame-metadata dimensions
- [x] 4.2 Custom entity test: a user-defined entity with an SVG entity-renderer layer appears in the PNG without rasterizer-specific setup
- [x] 4.3 File-write test with `FileSystem.layerNoop` capturing `writeFile` (path + bytes)
- [x] 4.4 `RasterizeError` test: unparsable SVG fails typed, not thrown
- [x] 4.5 Run the full workspace test suite and confirm green

## 5. Proof

- [x] 5.1 Export one real frame of a docs example scene (e.g. `moon-moth`) to a PNG file end-to-end — `Scene.stream` → `SvgRenderer.render` → `Resvg.rasterizeToFile` with `@effect/platform-node`'s FileSystem layer — and eyeball the result
