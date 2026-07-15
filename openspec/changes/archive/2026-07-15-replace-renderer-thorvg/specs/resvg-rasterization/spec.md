## REMOVED Requirements

### Requirement: Rasterize turns SVG strings into PNG bytes

**Reason**: ThorVG's software backend rasterizes the draw-list to a pixel buffer directly; there is no SVG string to rasterize and no resvg dependency.

**Migration**: The export path calls the ThorVG software sink per frame to obtain a pixel buffer, fed straight to ffmpeg (see `video-encoding`).

### Requirement: File output goes through the FileSystem service

**Reason**: The SVG→PNG→file helper is removed with resvg; frame buffers are streamed to ffmpeg rather than written as intermediate PNG files.

**Migration**: `video-encoding` streams ThorVG frame buffers to ffmpeg without intermediate PNG files.

### Requirement: Resvg options pass through

**Reason**: resvg-specific options (including its font config) no longer exist; ThorVG owns rasterization and font loading.

**Migration**: Font handling moves to ThorVG's rasterizer (see `font-loading`).

### Requirement: Rasterization failures are typed errors

**Reason**: The `RasterizeError` tied to resvg is removed; ThorVG rasterization surfaces its own failure type in the sink.

**Migration**: The ThorVG sink defines its own tagged error for rasterization/backend failures.
