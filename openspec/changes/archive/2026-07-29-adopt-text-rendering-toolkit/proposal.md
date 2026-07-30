## Why

The renderer's text pipeline hand-rolls what is now a maintained external stack: troika's typesetter for shaping/layout, `webgl-sdf-generator` for CPU SDFs, and ~510 lines of atlas + two-pass TSL material in `packages/renderer/src/Text.ts` — with two marked `ponytail:` ceilings (fixed 256-glyph single-channel atlas, no growth path) and a hand-written `troika.d.ts`. The `@text-rendering-toolkit/*` packages (font/layout/sdf/three-webgpu) cover the same pipeline with real HarfBuzz shaping, a growable RGBA-packed atlas, and a maintained `Text` mesh for `WebGPURenderer` — and their caller-owned-bytes font contract matches `Font.FontLoader` exactly. Toolkit 0.3.0's `depthInk` mode (openspec change `add-depth-ink-text-mode` in the toolkit repo) preserves this renderer's two-pass semantics, so the swap is a pure re-plumbing.

## What Changes

- Replace the renderer text pipeline with `@text-rendering-toolkit/font` + `/layout` + `/three-webgpu`: `Text.ts` shrinks to a thin adapter (font-handle cache, anchor mapping, `TextResources` per `Sync`, toolkit `Text` with `depthInk: true` per entity).
- Drop dependencies `troika-three-text` and `webgl-sdf-generator`; delete `troika.d.ts`.
- Rendering semantics preserved: SDF crispness, baseline-left anchor with `textAnchor`/`baseline` offsets, billboard behavior, exactly-once ink blending at partial opacity, z-buffer occlusion, z-lift above coplanar backdrops, loud defect for unregistered fonts.
- The fixed 256-glyph atlas ceiling and its overflow error disappear (toolkit atlas grows on demand); both `ponytail:` markers in `Text.ts` are retired.
- No changes to the `Text` entity schema, `Font` resources, or anything in `effect-motion` core. Toolkit-enabled features (fallback lists, wrapping, decorations, COLR) are explicitly out of scope — later changes.
- **Prerequisite**: `@text-rendering-toolkit/three-webgpu` 0.3.0 with `depthInk` released.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `three-text`: codify the blending and occlusion contract the implementation has always had but the spec never stated — overlapping glyph ink blends exactly once at partial opacity, and text ink occludes via the depth buffer like other entities. Codifying it is what makes "semantics preserved" verifiable across the swap. Existing requirements (SDF crispness, font fidelity, anchor/baseline) are unchanged and must keep holding.

## Impact

- `packages/renderer`: `Text.ts` rewritten as adapter; `Builtins.ts` text entity renderer keeps its build/update/key/waitFor shape with layout re-keyed through the toolkit; `Sync.ts` owns font-handle + `TextResources` disposal; `package.json` dependency swap; `troika.d.ts` deleted.
- Tests: `text-node.test.ts`'s quad-orientation test rewritten against the toolkit's `LayoutResult`; behavioral tests (default font render, missing-loader defect) unchanged in intent.
- Known cost: the font package vendors ~390 KB of HarfBuzz WASM resolved via `import.meta.url` — works in Node (headless export) and modern bundlers; downstream consumers' bundlers must handle a `.wasm` asset reference. Recorded as an accepted tradeoff.
- `font-loading` and `text-entity` capabilities: no requirement changes.
