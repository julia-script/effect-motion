## Context

`replace-thorvg-with-three` shipped a working per-pixel DoF in `packages/renderer/src/dof.ts`, shared verbatim by the browser (`Renderer.ts`, lazily-built size-keyed `RenderPipeline`) and export (`node.ts`, pipeline built once at renderer construction) paths. It is a **single-pass scatter-as-gather blur**: per pixel, a CoC from view depth (`strengthUv = 2·aperture / frame.height`), then 97 Vogel-spiral taps at mip level 0 rotated per pixel by interleaved gradient noise, each tap kept only if the TAP's own CoC reaches the center pixel.

That structure has three consequences, and they are properties of the algorithm, not tuning:

1. **Tap radius is the CENTER pixel's CoC.** A sharp background pixel searches at radius ≈ 0, so it can never discover a blurred foreground neighbor. Foreground blur is therefore clipped to its own silhouette — no bleed, hard cutout edges.
2. **Kept taps are equally weighted.** A blurred foreground averages with background rather than covering it in proportion to coverage. Overlaps read as blends, not layers.
3. **97 stochastic taps still carry variance.** Invisible on textured 3D; visible as grain on flat 2D color fields.

Three's own `DepthOfFieldNode` is not an option — the port abandoned it after finding it collapses to a single center texel permanently under Dawn and on the first frame in Chrome (see that change's D6).

Constraints inherited from the port: one implementation serves both paths (divergence is a bug); determinism is frame-level only — "if they look the same, they are the same", never pixel-exact; the export path runs headless under Dawn where allocation and pass count cost real wall-clock across thousands of frames; and TSL node graphs must stay behind minimal local interfaces with loose casts, because @types/three's `ShaderNodeObject` unions sent tsc into a 14-CPU-minute type expansion.

## Goals / Non-Goals

**Goals:**
- Foreground blur that bleeds correctly over sharp background — the artifact that most visibly separates this from After Effects on 2D content.
- Layer-ordered compositing so overlaps read as occlusion rather than averaging.
- Artifact-free blur on flat color fields: no tap structure, no rings or petals, no motion shimmer.
- Aperture-shaped bokeh (circular or N-bladed), reaching the public camera data as optional fields.
- Aperture 0 remains structurally free, and both render paths keep sharing one implementation.

**Non-Goals:**
- Changing how CoC derives from depth. The port's `strengthUv = 2·aperture / height` calibration against the old ThorVG sigma curve stands; this change alters how the blur is *applied*, not how strong it is.
- Physically-correct lens simulation (chromatic aberration, cat's-eye vignetting, anamorphic bokeh, focus breathing).
- Any change to the frame stream, scene authoring, or the entity render contract.
- Per-object DoF overrides or manual layer assignment — layers are derived from depth, never authored.

## Decisions

### D1 — Layered (near / focus / far) over scatter-splat or wider gather

Three candidate architectures fix foreground bleed:

- **Wider fixed-radius gather**: search every pixel at the frame's max CoC. Fixes bleed, but cost scales with the largest blur in frame regardless of local need, and it still averages rather than layers. Rejected — pays the most and fixes the least.
- **Point-sprite scatter**: render each source pixel as a CoC-sized sprite, additively accumulated with premultiplied weights. Physically the most faithful (this is literally what a lens does), and bokeh shape falls out of the sprite texture for free. Rejected as the primary architecture: it needs a geometry pass with one primitive per source pixel, its cost is data-dependent (unbounded overdraw when a large area is strongly blurred), and energy normalization at layer boundaries is fiddly. It remains the escape hatch if D2's dilation proves insufficient.
- **Layered, tile-dilated, half-res** (chosen): split by signed CoC, blur each layer independently, composite with alpha. Bounded cost, no data-dependent overdraw, and the near layer's alpha *is* the bleed. This is the modern production approach (Unreal's diaphragm DoF, Frostbite) and is what AE's behavior most resembles.

### D2 — Tile-based max-CoC dilation is what makes bleed possible

A background pixel must know a blurred foreground is coming before it can receive its color. Compute a downsampled tile buffer holding the maximum near-field CoC per tile, then dilate it by the blur radius in tiles. The near-layer gather reads the dilated tile value as its search radius, so pixels *outside* the foreground silhouette still search far enough to find it. Without this pass the near layer is just the current blur again, restricted to its own silhouette.

Tile size and dilation radius are a cost/accuracy knob: too-large tiles over-search (wasted taps, possible halo past the true CoC), too-small tiles cost more dilation iterations. Start with 16px tiles and tune against the flat-content test scene.

### D3 — Half-resolution layer blurs, full-resolution composite

Blur each layer at half linear resolution (quarter the pixels). Blur is a low-pass filter, so the information discarded is information the blur removes anyway; this is the standard production trade and it is what buys back the passes D1 adds. The composite runs at full resolution against the full-res sharp layer, so in-focus content never round-trips through a downsample — critical here, since sharp text and thin strokes are exactly what 2D scenes are made of and exactly what a half-res round trip would soften.

### D4 — Bokeh shape via a weighting function, not a sprite texture

With the layered architecture, taps are still a gather, so shape comes from *weighting* taps by whether they fall inside the aperture polygon rather than from a sprite image. A signed-distance test for a regular N-gon (blade count, rotation) is a few ALU ops per tap, needs no texture upload, and keeps the shape animatable through a plain uniform — consistent with blade rotation being a tweenable camera field. Blade count below 3 (or unset) short-circuits to the circular radius test.

### D5 — Bokeh fields live in the `depth-of-field` capability, on camera data

The new fields (`bokehBlades`, `bokehRotation` — final names settled during implementation) join `aperture`/`focusDistance` as optional camera data, defaulted by the Runner exactly as `focalLength` and `focusDistance` are today. They ride frame metadata like the rest of the camera, so both render paths read them from the frame with no new plumbing. They are optional and default to circular, so every existing scene is unaffected — additive, not breaking.

The delta lands on `depth-of-field` rather than `camera` because that capability already owns "Focus fields are camera data"; the `camera` spec still describes the legacy SVG-sink per-layer view transform and is not touched here.

### D6 — Sampling: deterministic, and quiet enough to not need jitter

The current per-pixel noise rotation exists to dissolve tap structure that a fixed disc would show. With half-res layers and a denser effective kernel, prefer a **fixed** tap pattern with smooth radial weighting, keeping the noise rotation only if flat-content tests still show structure. A fixed pattern removes the residual per-pixel grain entirely — the frame-to-frame shimmer requirement in the spec — and stays trivially deterministic. Determinism is not at risk either way: interleaved gradient noise is a pure function of pixel coordinates, so both options reproduce exactly. This is a quality call to settle empirically against the flat-disc test, not an architectural one.

### D7 — Pipeline construction mirrors the existing split, unchanged in shape

Neither path changes structurally: the browser keeps lazily building a size-keyed pipeline in `ensureDofPipeline()` (rebuilt when the drawing-buffer size changes, since the new intermediate targets are size-dependent too), and the node path keeps building once at renderer construction and disposing with the scope. Only what the pipeline *contains* changes. Intermediate render targets are created with the pipeline and disposed with it — never per frame, which would be a per-frame allocation across thousands of export frames.

## Risks / Trade-offs

- **[Pass count regresses export throughput]** → Half-res layer blurs (D3) are the primary mitigation. Measure export wall-clock on the same scenes benchmarked during the port (rack-focus, depth-grid) before and after; if the regression is material, drop tap counts per layer before sacrificing layer separation — the layering is the point, the tap density is the knob.
- **[Tile dilation produces halos]** → Over-dilated tiles let a foreground bleed further than its true CoC, appearing as a faint rectangular-ish aura. Mitigate by weighting each tap by the tap's own CoC (as today) so over-search costs performance rather than correctness, and tune tile size against the flat-content scene.
- **[Layer boundary discontinuity]** → Hard near/focus/far classification can show a visible seam where content crosses a boundary, especially during a rack focus that sweeps content across it. Mitigate with a soft (smoothstep) transition band on the classification rather than a binary test, so a pixel near the boundary contributes partially to both layers.
- **[Half-res artifacts on thin geometry]** → Thin strokes and small text that fall in a *blurred* layer can alias or drop out at half resolution. The full-res sharp composite (D3) protects in-focus content; blurred thin geometry is far less sensitive by construction, but this is the first place to look if lines misbehave.
- **[TSL type-checking blowup]** → The port's hard-won rule applies unchanged: all node graphs behind minimal local interfaces and loose casts. A multi-pass chain has more node surface than the current single blur, so this risk grows rather than shrinks. Typecheck early and often; a regression here costs CPU-minutes per build.
- **[Two paths drift]** → More pipeline construction code means more room for browser and export to diverge. Keep every node-graph builder in `dof.ts` with both paths calling the same functions, exactly as `buildDofBlur` is shared today, and keep an export-vs-browser comparison of the same frame in the verification loop.

## Migration Plan

Additive and internal: no scene, authoring, or frame-stream change, and the new camera fields are optional with circular defaults, so every existing scene renders as before (modulo the intended quality improvement). Rollback is reverting `dof.ts` and the two pipeline construction sites to the single-pass blur; the camera fields are inert without it and can stay or go independently.

Sequencing: `replace-thorvg-with-three` must land first — this builds directly on that change's `dof.ts`, its shared-implementation invariant, and its per-pixel DoF spec baseline.

## Open Questions

- Tile size and dilation iteration count (D2) — settle empirically against a flat-content stress scene; 16px is the starting guess, not a decision.
- Whether the noise rotation survives (D6) — decide from the flat-disc test once the layered kernel is in place.
- Whether the in-focus layer needs any blur at all, or can composite straight from the sharp pass. Straight-through is cheaper and keeps sharp content pristine; it may show a seam where the focus layer meets a blurred one, which the D6 soft transition band may or may not fully cover.
- Final field names for the bokeh shape (`bokehBlades`/`bokehRotation` vs. `apertureBlades`/`apertureRotation`) — cosmetic, settle when writing the schema.
- Whether a DoF-heavy stress scene should be added to the docs examples. The port noted the absence of a dedicated bokeh scene as an accepted gap; this change is the natural point to close it, and such a scene doubles as the verification fixture.
