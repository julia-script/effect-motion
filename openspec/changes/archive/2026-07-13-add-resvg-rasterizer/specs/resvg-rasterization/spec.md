# resvg-rasterization — delta for add-resvg-rasterizer

## ADDED Requirements

### Requirement: Rasterize turns SVG strings into PNG bytes
`@effect-motion/export` SHALL provide `Resvg.rasterize(svg, options?)` returning an Effect that succeeds with the encoded PNG bytes (`Uint8Array`) for the given SVG document string. It SHALL accept any SVG string — the output of `SvgRenderer.render` composes directly, with entity renderers registered for the string sink working unchanged and no rasterizer-specific registration. Output dimensions SHALL come from the SVG document itself (the string sink stamps frame `width`/`height` on the root).

#### Scenario: Rendered frame to PNG
- **WHEN** a frame from a scene run with `{ width: 500, height: 300 }` is folded by the string sink and the result passed to `Resvg.rasterize`
- **THEN** the result is a valid PNG (signature bytes) with 500×300 dimensions, painted on the frame's background color

#### Scenario: Custom entities need no extra registration
- **WHEN** a user-defined entity has an SVG entity-renderer layer registered and its frame's string output is rasterized
- **THEN** the entity appears in the PNG with no rasterizer-specific setup

### Requirement: File output goes through the FileSystem service
`Resvg.rasterizeToFile(svg, path, options?)` SHALL rasterize and write the PNG bytes to `path` using the `effect/FileSystem` service — never `node:fs` directly. Filesystem failures SHALL surface as typed `PlatformError`s. Consumers provide the `FileSystem` implementation (e.g. `@effect/platform-node`); the package SHALL NOT bundle one.

#### Scenario: Write to disk
- **WHEN** `rasterizeToFile(svg, "out/frame-0001.png")` runs with a `FileSystem` layer provided
- **THEN** the PNG bytes are written to that path via the service

#### Scenario: Tests run without a real filesystem
- **WHEN** the write path is exercised with `FileSystem.layerNoop` capturing `writeFile`
- **THEN** the call completes and the captured invocation carries the path and the PNG bytes

### Requirement: Resvg options pass through
Both functions SHALL expose resvg's font options (`loadSystemFonts`, `fontFiles`, `fontDirs`, `defaultFontFamily`) and scaling (`fitTo`) as an untranslated passthrough, defaulting to resvg's own defaults with system fonts loaded.

#### Scenario: Explicit font files
- **WHEN** options carry `fontFiles` pointing at a font on disk
- **THEN** resvg rasterizes text with that font available for resolution

### Requirement: Rasterization failures are typed errors
Failures raised by resvg SHALL surface as a tagged `RasterizeError` carrying the underlying cause — not as defects and not as thrown exceptions.

#### Scenario: Bad input fails, not crashes
- **WHEN** `rasterize` is called with an unparsable SVG string or options resvg rejects
- **THEN** the effect fails with a `RasterizeError` describing the cause
