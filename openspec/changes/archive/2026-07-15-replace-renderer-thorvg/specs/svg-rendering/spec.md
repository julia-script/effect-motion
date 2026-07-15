## REMOVED Requirements

### Requirement: SvgNode contract

**Reason**: Replaced by the renderer-agnostic `draw-list` contract, which carries no SVG-specific concepts and is consumed by the ThorVG sink.

**Migration**: Sinks and shape renderers emit draw-list nodes instead of `SvgNode`. Tests that asserted on `SvgNode`/SVG strings assert on the draw-list.

### Requirement: String sink

**Reason**: The self-contained SVG string sink existed to feed resvg for export; ThorVG rasterizes to a pixel buffer directly, so no SVG string is produced.

**Migration**: Export goes through the ThorVG software backend (see `thorvg-renderer` and `video-encoding`).

### Requirement: DOM sink

**Reason**: Live playback moves to a ThorVG GPU canvas; the clear-and-rebuild SVG DOM sink is removed.

**Migration**: The React Player mounts a ThorVG canvas (see `react-player`).

### Requirement: Absolute positioning

**Reason**: Positioning is now expressed by the draw-list's 2D transforms/points, produced by the projection pipeline and consumed by ThorVG.

**Migration**: Equivalent behavior lives in the `draw-list` and `thorvg-renderer` capabilities.

### Requirement: Hierarchical rendering

**Reason**: Group nesting is expressed via draw-list groups mapped to nested ThorVG `Scene`s (and, post-2.5D, the flatten stage already composes group coordinates).

**Migration**: Covered by `draw-list` (group nodes) and `thorvg-renderer` (nested `Scene`s).

### Requirement: Live playback playground

**Reason**: Tied to the SVG DOM sink; superseded by ThorVG-canvas playback.

**Migration**: Covered by `react-player`.

### Requirement: Sinks agree on the built-in shape surface

**Reason**: There is no longer a string-vs-DOM pair to reconcile — one ThorVG sink with two backends sharing the same draw-list-walking code.

**Migration**: Cross-backend consistency is covered by `thorvg-renderer` ("the same scene renders on both backends").
