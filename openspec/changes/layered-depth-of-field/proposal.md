## Why

The DoF that shipped with the three.js port is a single-pass scatter-as-gather blur: each pixel searches a Vogel-spiral disc sized by its OWN circle of confusion. That structure has a hard ceiling. A sharp background pixel searches at radius ≈ 0, so it can never find a blurred foreground object — a near subject cannot bleed past its own silhouette, and its edge reads as a cutout instead of a soft halo. Kept taps are also equally weighted, so a blurred foreground averages with the background behind it rather than covering it proportionally to coverage, and 97 stochastic taps still leave visible grain on flat color fields.

Noisy 3D renders hide all three. Flat 2D motion graphics — this library's stated first audience — are the most unforgiving possible content for them, and they are exactly what authors will compare against After Effects. The fix is not more taps; it is a different pipeline.

## What Changes

- Replace the single-pass gather blur with a **layered DoF pipeline**: split the frame into near / in-focus / far layers by signed CoC, blur each independently at half resolution, and composite near-over-sharp-over-far with alpha so foreground blur correctly bleeds over sharp background.
- Add **tile-based max-CoC dilation** so a blurred foreground's influence is known to the pixels it must bleed onto — the pass that makes foreground bleed possible at all.
- Blur each layer with an **aperture-shaped kernel** instead of a uniform disc, producing real bokeh (crisp-rimmed highlights) rather than a mushy gaussian falloff.
- **Expose aperture shape on the camera**: new optional fields for the bokeh shape (circular or an N-bladed polygon, with rotation). Purely additive — existing scenes that set only `aperture` and `focusDistance` keep working unchanged.
- Keep aperture 0 structurally off: the whole chain stays bypassed, as today.
- Retire the `ponytail:` tap-count marker on the current blur; the ceiling it names ceases to exist.

Not in scope: changing how CoC is derived from depth (the port's `strengthUv = 2·aperture / height` calibration stands), and any change to the frame stream — this is renderer-internal plus two optional camera fields.

## Capabilities

### New Capabilities
<!-- none — this refines existing behavior rather than introducing a new capability -->

### Modified Capabilities
- `depth-of-field`: blur quality becomes a stated requirement (foreground bleed over sharp background, layered compositing, no visible tap structure on flat fields) rather than only "blurs continuously with depth"; adds aperture-shape/bokeh requirements, and extends the camera's focus fields with the optional bokeh shape. The bokeh fields live in this capability because it already owns "Focus fields are camera data" — the `camera` spec covers the legacy SVG-sink view transform and is untouched.

## Impact

- `packages/renderer/src/dof.ts` — rewritten; the single-pass gather node is replaced by the layered pass chain.
- `packages/renderer/src/Renderer.ts` and `packages/renderer/src/node.ts` — both render paths build the new multi-pass pipeline and must stay behaviorally identical (browser and export share one implementation, as they do today); the node path additionally allocates the intermediate targets per size.
- `packages/motion/src/Camera.ts` (+ its schema) — new optional bokeh fields; `Runner` fills defaults as it does for `focalLength`/`focusDistance`.
- `packages/renderer/test/` — structural assertions for the new pipeline (layer targets exist, uniforms wired, aperture 0 bypasses); quality itself is verified by headless renders read as images, never pixel equality.
- Depends on `replace-thorvg-with-three` landing first: this builds directly on that change's per-pixel DoF baseline and its `dof.ts`.
- Performance: more passes and intermediate render targets than today. Half-resolution layer blurs are the mitigation; export throughput is the metric to watch.
