## 1. Verification fixture first

- [ ] 1.1 Author a DoF stress scene (flat solid discs at several depths against a flat background, plus a small bright highlight for bokeh, plus thin strokes and text in and out of focus) and register it in the docs examples registry — it doubles as the docs' missing bokeh example and every later task's fixture
- [ ] 1.2 Add a headless probe script that renders chosen frames of that scene to PNG and reports the specific artifacts as numbers (edge-transition width outside a near subject's silhouette, ring/petal detection on a flat disc's falloff, frame-to-frame pixel delta on a static blurred region) — the current blur must FAIL the bleed and shimmer checks, establishing the baseline the change has to beat
- [ ] 1.3 Capture baseline browser screenshots and an export render of the stress scene with today's single-pass blur, for before/after comparison

## 2. Camera bokeh fields

- [ ] 2.1 Add the optional bokeh shape fields (blade count, blade rotation) to the Camera schema in `packages/motion/src/Camera.ts`, defaulting to circular
- [ ] 2.2 Fill defaults in the Runner alongside the existing `focalLength`/`focusDistance` filling, and carry the fields on frame metadata
- [ ] 2.3 Add frame-stream tests: defaults present and circular when unset, blade rotation tweens smoothly, fields ride frame metadata
- [ ] 2.4 Verify aperture 0 with blade fields set still reports DoF off in the renderer's frame sync (the fields alone must not enable the chain)

## 3. Layer separation and tile dilation

- [ ] 3.1 In `dof.ts`, compute signed CoC per pixel and split into near / in-focus / far classification with a soft (smoothstep) transition band per design D6/risk note
- [ ] 3.2 Build the downsampled max-near-CoC tile buffer pass (start at 16px tiles)
- [ ] 3.3 Add the tile dilation pass so tiles outside a near subject's silhouette carry its CoC
- [ ] 3.4 Structural tests: tile buffer and dilation targets exist at expected sizes, uniforms wired, no targets allocated when aperture is 0

## 4. Layer blur and composite

- [ ] 4.1 Implement the half-resolution layer blur with a fixed tap pattern and smooth radial weighting, using the dilated tile CoC as the near layer's search radius
- [ ] 4.2 Implement the full-resolution near-over-focus-over-far alpha composite, with the sharp layer composited at full res (never round-tripped through the downsample)
- [ ] 4.3 Wire the aperture-polygon weighting (signed-distance N-gon test, blade count < 3 short-circuits to circular) into the tap weighting
- [ ] 4.4 Decide the noise-rotation question (design D6) from the flat-disc probe: keep the per-pixel rotation only if fixed taps still show structure — record the outcome in design.md
- [ ] 4.5 Decide whether the in-focus layer composites straight from the sharp pass or needs its own blur (design open question) — record the outcome

## 5. Both render paths

- [ ] 5.1 Rebuild the browser pipeline in `Renderer.ts` `ensureDofPipeline()` on the new chain, keeping the size-keyed lazy rebuild and disposing the new intermediate targets with the pipeline
- [ ] 5.2 Rebuild the node pipeline in `node.ts` on the same shared builders from `dof.ts`, constructed once and disposed with the scope — no per-frame allocation
- [ ] 5.3 Verify aperture 0 still bypasses entirely on both paths (no intermediate targets rendered, no measurable cost)
- [ ] 5.4 Render the same frame through browser and export and confirm they match visually — the shared-implementation invariant

## 6. Verification against the spec

- [ ] 6.1 Foreground bleed: probe confirms a near subject's blur extends past its silhouette over sharp background, with background outside the bleed still sharp
- [ ] 6.2 Layer ordering: blurred near over in-focus mid reads as coverage-weighted occlusion, not a 50/50 blend; blurred far behind a sharp foreground does not wash over its edge
- [ ] 6.3 Flat-content quality: no rings, petals, or visible tap positions on a strongly blurred flat disc; no frame-to-frame shimmer on a static blurred region
- [ ] 6.4 Bokeh shape: a blade count of 6 yields hexagonal highlights; unset yields circular; shape identical across both render paths
- [ ] 6.5 Rack focus across the stress scene renders correctly end to end in the browser, and the boundary sweep shows no layer seam

## 7. Performance and close-out

- [ ] 7.1 Measure export wall-clock on rack-focus and depth-grid against the pre-change numbers; if materially regressed, reduce per-layer tap counts before sacrificing layer separation
- [ ] 7.2 Confirm typecheck time has not regressed (TSL type-expansion risk) and all node graphs stay behind minimal local interfaces
- [ ] 7.3 Remove the superseded `ponytail:` tap-count marker from `dof.ts`; add markers for any ceiling this change consciously leaves (e.g. tile size heuristic, no cat's-eye vignetting)
- [ ] 7.4 Update `dof.ts`'s module doc to describe the layered pipeline, replacing the single-pass gather description
- [ ] 7.5 Full gate: lint, build, tests across all packages, and `openspec validate --strict`
