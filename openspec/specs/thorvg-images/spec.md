# thorvg-images Specification

## Purpose
Picture/image loading over ThorVG's compiled-in decoders (svg, png, jpg, webp, lottie, raw), with size and origin control, in the bindings-only `@effect-motion/thorvg` package.

## Requirements

### Requirement: Picture loading from encoded data
The thorvg package SHALL expose loading encoded image/vector data into a picture paint via `_tvg_picture_load_data`, accepting the mimetypes the engine's loader dispatch supports: `svg`, `png`, `jpg`/`jpeg`, `webp`, `lot`/`lottie+json`. Input is bytes; marshalling uses the package's scoped scratch memory; a non-success result code fails with a typed `ThorvgException` naming the operation.

#### Scenario: PNG bytes render
- **WHEN** PNG bytes are loaded into a picture and the picture is added to a scene and drawn
- **THEN** the decoded image appears in the rendered output

#### Scenario: SVG data loads
- **WHEN** UTF-8 SVG bytes are loaded with the `svg` mimetype
- **THEN** the load succeeds and the picture reports a natural size

#### Scenario: Unsupported data fails loudly
- **WHEN** bytes that no loader accepts are loaded
- **THEN** the effect fails with a `ThorvgException` carrying the result code and operation name

### Requirement: Raw pixel loading
The package SHALL expose `_tvg_picture_load_raw` for premultiplied/straight raw pixel buffers with explicit width, height, and color space, copying the data so the caller's buffer may be released after the call.

#### Scenario: Raw RGBA buffer loads
- **WHEN** a width×height RGBA buffer is loaded as raw with matching dimensions
- **THEN** the load succeeds and the picture renders those pixels

### Requirement: Picture size and origin
The package SHALL expose picture size (get and set) and origin (set), reading out-parameters through scoped scratch memory.

#### Scenario: Natural size readable
- **WHEN** an image is loaded and its size is read
- **THEN** the natural width and height are returned as numbers

#### Scenario: Scaling via set size
- **WHEN** a picture's size is set to new dimensions before drawing
- **THEN** the rendered output reflects the scaled dimensions

### Requirement: Picture data is paint-tier
Decoded picture data SHALL follow the existing paint lifecycle: the picture paint owns its decoded data, ownership transfers to the parent on add, and a detached picture is freed by its scope finalizer. No session- or engine-level registry SHALL hold picture data.

#### Scenario: Detached picture freed on scope close
- **WHEN** a picture is loaded but never added to a parent and the scope closes
- **THEN** the picture and its decoded data are freed exactly once
