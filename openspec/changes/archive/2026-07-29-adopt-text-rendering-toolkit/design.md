## Context

See proposal.md — Why. What shapes the approach:

- Current pipeline: `packages/renderer/src/Text.ts` owns font registration (base64 data URIs into troika's typesetter), a fixed 256-glyph single-channel atlas, pure-JS SDF generation, and a hand-built two-pass TSL material (`makeMesh`). `Builtins.ts`'s text entity renderer re-layouts on a `text|fontSize|fontFamily|textAnchor|baseline` key change via `ctx.waitFor`; `Sync.ts` owns the `Text.make()` actor and registers fonts from `FontLoader` bytes in `resolveResources`.
- Toolkit boundary match: `FontLoader.bytes → loadFont(bytes)` (caller-owned bytes, no fetching); `layoutText` consumes a font map keyed by strings — the `Font` resource id is the natural key; `three-webgpu`'s `Text extends Mesh` with `await sync()` slots into `ctx.waitFor`; one `TextResources` per `Sync` replaces the shared atlas.
- Prerequisite: toolkit 0.3.0's `depthInk` mode (toolkit repo, change `add-depth-ink-text-mode`) carries the two-pass exactly-once/depth-occlusion semantics this renderer currently implements itself.
- Core (`packages/motion`) is untouched: schema, `Font.ts`, determinism invariants. Fonts still never affect frame data.

## Goals / Non-Goals

**Goals:**

- Pure re-plumbing: every observable text behavior in the `three-text` spec (including the two newly codified requirements) holds before and after.
- Net-negative renderer code: `Text.ts` ~510 lines → thin adapter; `troika.d.ts` deleted; two deps replaced by three scoped packages.
- Keep the entity renderer contract in `Builtins.ts` unchanged in shape (build/update/layout-key/waitFor).

**Non-Goals:**

- Any `Text` schema extension (fallback font lists, `maxWidth` wrapping, decorations, letterSpacing, COLR, outline/shadow). Each is a separate later change.
- Pixel-identical output. Determinism here is frame-level; shaping engine and SDF generator both change, so glyph raster output legitimately differs. The contract is the spec's observable behaviors.
- Exposing toolkit types on any public effect-motion API.

## Decisions

**1. Integrate at the `three-webgpu` layer, not font+layout+sdf with a custom mesh.**
The toolkit's `Text`/`TextResources` replaces the entire atlas + material half of `Text.ts`, including both `ponytail:` ceilings (growable RGBA-packed atlas). With `depthInk` upstream there is nothing left that the hand-built material does better. Alternative — keep the local mesh and use only shaping/layout/SDF: rejected, retains ~300 lines and the atlas ceilings for no benefit.

**2. Adapter state lives where the old state lived: on `Sync`.**
`Sync` owns one `TextResources` and a `Map<fontId, FontHandle>` (from `loadFont` on `FontLoader.bytes`; default-font bytes via the existing `Font.loadDefaultBytes` path). `resolveResources` keeps its exact contract — register on first sight, auto-provide `"sans-serif"` beneath caller context, die loudly naming an unprovided font. `Sync.dispose` disposes every `FontHandle` and the `TextResources` after entity meshes (borrowers before owner, per toolkit contract).

**3. Anchor mapping is a pure function in the adapter.**
`textAnchor` start/middle/end → `anchorX` `'left'/'center'/'right'`; `baseline` auto/middle/hanging → `anchorY` `'top-baseline'/'middle'/'top'`. Defaults preserve baseline-left at (0,0). The scene's y-up convention matches the toolkit's y-up layout coordinates — no flip. The existing multi-line orientation test guards this at the `LayoutResult` level.

**4. Entity renderer keeps its key-based re-layout; layout runs in the adapter.**
On key change, the adapter builds the layout (`layoutText` with a single-entry `fontKeys: [fontId]`), assigns `text.layout`, and `ctx.waitFor(Effect.tryPromise(() => text.sync()))` — same never-present-half-built-strings guarantee as today, same typed-error surface (`EffectMotionError` wrapping toolkit errors, naming the font). Per-frame `fontSize` tweens re-run prepare+layout each frame like troika re-typeset today; if profiling ever shows it hot, cache `prepareText` per string (`ponytail:` marker at the call site).

**5. Construction: `depthInk: true`, unlit, shared resources, z-lift outside.**
Each entity's toolkit `Text` is constructed with `{ resources, depthInk: true }`. The 0.05 z-lift and billboard flag stay in the entity renderer exactly as now (mesh position / `Retained.billboard`), since they are effect-motion scene semantics, not text semantics.

**6. Version pin: caret on `^0.3.0`.**
Normal caret ranges; the toolkit is the same author's and 0.x minors are treated as feature releases. The prerequisite is enforced by ordering (this change starts after 0.3.0 ships), not by build tooling.

## Risks / Trade-offs

- [WASM asset: ~390 KB HarfBuzz resolved via `import.meta.url`] → Works in Node and Vite/Next (docs site) today; downstream bundlers must support `.wasm` asset references. Accepted and documented in the renderer README; revisit only if a consumer reports breakage.
- [Renderer output changes at the pixel level (different shaper, different SDF)] → In-contract: determinism is frame-level, "if they look the same, they are the same." Tests assert behavior, not pixels; the existing PNG-size heuristic test tolerates raster drift.
- [Toolkit `Text.sync()` throws typed toolkit errors, not Effect errors] → Adapter wraps every toolkit call in `Effect.tryPromise`/`Effect.try` mapping to `EffectMotionError`, preserving the don't-throw convention and the defect messages the tests assert on (font id present).
- [`FontHandle` lifetime: layout must not run against a disposed handle] → Handles are disposed only in `Sync.dispose`, after the retained scene graph; the existing scope ordering already guarantees entities die first.
- [Toolkit 0.3.0 slips or `depthInk` lands differently than designed] → This change stays blocked until the toolkit change ships; if the API shape drifts, revisit Decision 5 before starting tasks.

## Migration Plan

Single-package swap inside `@effect-motion/renderer`; no public API change, no consumer migration. Ship as a renderer minor with a changeset noting the WASM asset and the atlas-ceiling removal. Rollback is reverting the renderer package to the previous release.

## Open Questions

None.
