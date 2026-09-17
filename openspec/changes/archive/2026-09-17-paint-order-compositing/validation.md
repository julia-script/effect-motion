## Implementation evidence

- Default scene/frame/mount metadata is explicit; default Group mode is inherit.
- Retained draw policy updates every frame and again after async text/image work.
  Paint materials share the transparent queue with depth rejection disabled.
- Paint groups reuse the composition actor with content-derived fractional bounds,
  shared text/image resources, local projection, external transforms, alpha discard
  and opacity once. Removed nested compositions now execute their disposal Effects.
- Sampled WebGPU targets preserve alpha, unassociate premultiplied RGB for the
  material blend, and correct the render target's vertical texture orientation.
- Projected target density accounts for viewport scale and surface magnification;
  oversized allocations fail with the composition id and device limit.

## Depth migration inventory

`depth-orbit`, `bezier-3d`, and `camera-tour` explicitly select depth. The new
`paint-order` lab also selects depth for its world controls. `camera-follow-graph`
moves the camera over a flat drawing and intentionally retains paint mode.
`border-stress` uses perspective projection but demonstrates a 2D drawing, so it
retains paint and removes the old background z-offset workaround. The default
scaffold's hello-world scene has no physical depth dependency and remains paint.
Existing depth-ink GPU tests explicitly select depth; paint tests cover the new
ordering contract. No coordinate-based automatic mode selection is used.

## Checks and visual evidence

- Core: 260 tests (the legacy Hud/Group identical-field assertion was adjusted for
  Group's new compositing field).
- Renderer: 36 tests including retained reorder, custom material policy, depth
  restoration, nested fractional bounds, repeated updates/removal and cycles.
- Node lab exports: `/tmp/paint-order-evidence3/frame-0.png`, `frame-20.png`,
  `frame-40.png`. Inspection confirmed circle reorder, upright text, group opacity,
  tilted surface, transparent hole, and the two reversed-authoring depth controls.
- Text and image resources are shared with child contexts; actual retained geometry
  is measured after async work before target allocation.
- Node evidence generator: `bunx tsx packages/renderer/test/support/render-evidence.ts
  apps/docs/examples/paint-order.scene.ts /tmp/paint-order-evidence3`.

Stroke segment opacity and fractional edge quality remain for the next two changes.
The current target policy is intentionally refined after the stroke union exists.

- Browser: `/tmp/paint-browser-final.png`, upright labels and transparent hole match Node; no browser errors.
- Sequential 41-frame render and fresh final-frame render: `/tmp/paint-order-final/frame-40.png` and `fresh-last.png`; visible layering agrees.
- Core/renderer/three/docs type checks and scoped Biome checks pass.
