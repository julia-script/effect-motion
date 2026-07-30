## 1. Prerequisite gate

- [x] 1.1 Confirm `@text-rendering-toolkit/three-webgpu@0.3.0` is published with the `depthInk` construction option (toolkit change `add-depth-ink-text-mode` archived); verify the API shape matches design Decision 5 before proceeding

## 2. Dependency swap

- [x] 2.1 In `packages/renderer/package.json`: remove `troika-three-text` and `webgl-sdf-generator`; add `@text-rendering-toolkit/font`, `@text-rendering-toolkit/layout`, `@text-rendering-toolkit/three-webgpu` (`^0.3.0`)
- [x] 2.2 Delete `packages/renderer/src/troika.d.ts`; `pnpm install` and confirm the workspace builds far enough to show only the expected `Text.ts`/`Sync.ts`/`Builtins.ts` errors

## 3. Adapter rewrite (`packages/renderer/src/Text.ts`)

- [x] 3.1 Replace the `Text` actor state with the toolkit-backed shape: one `TextResources`, a `Map<fontId, FontHandle>`, and `registerFont`/`hasFont` implemented via `loadFont` on `FontLoader` bytes (wrapped in `Effect.tryPromise` → `EffectMotionError` naming the font)
- [x] 3.2 Implement the anchor mapping (`textAnchor` → `anchorX`, `baseline` → `anchorY` per design Decision 3) and the layout builder (`layoutText` with single-entry `fontKeys`); keep unregistered-font layout a defect naming the font id
- [x] 3.3 Replace `makeMesh` with construction of a toolkit `Text` (`{ resources, depthInk: true }`) exposing the same adapter surface the entity renderer uses (set layout+sync, set color/opacity, dispose); keep the 0.05 z-lift on the returned object
- [x] 3.4 `dispose(text)` disposes every cached `FontHandle` and the `TextResources`; delete the atlas/SDF/glyph-slot code and both retired `ponytail:` comments

## 4. Integration (`Sync.ts`, `Builtins.ts`)

- [x] 4.1 `Sync.ts`: keep `resolveResources` contract unchanged against the new actor (first-sight registration, `"sans-serif"` auto-provide beneath caller context, loud defect otherwise); dispose order stays entities → text actor
- [x] 4.2 `Builtins.ts`: text entity renderer keeps build/update/key shape; on key change run adapter layout + `sync()` inside `ctx.waitFor`; color/opacity and billboard/position handling unchanged

## 5. Tests

- [x] 5.1 Rewrite the multi-line orientation test in `packages/renderer/test/text-node.test.ts` against the adapter's `LayoutResult`-based output (line 2 strictly below line 1 in y-up; default anchor baseline-left at origin)
- [x] 5.2 Confirm the behavioral tests pass unchanged in intent: default-font headless render produces real glyph content; missing custom loader dies naming the font id
- [x] 5.3 Add spec-scenario tests for the codified requirements: overlapping-ink seam check at partial opacity and text-occludes-shape / coplanar-backdrop checks (headless Node render, behavioral assertions not pixel-exact)

## 6. Wrap up

- [x] 6.1 Update the renderer README/CLAUDE.md pipeline description (toolkit-based text, WASM asset note, atlas ceiling removed) and sync the `three-text` spec wording if it still names troika
- [x] 6.2 `pnpm lint:fix && pnpm check && pnpm test` green at the repo root; add a renderer changeset (minor) noting the dependency swap, WASM asset, and atlas-ceiling removal
