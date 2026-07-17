# Image assets: Images annotation, Shapes.Image, session-held pictures

## Why

The thorvg package can decode and render pictures (`Picture.ts`, shipped in restructure-thorvg-lifetimes) but nothing scene-authors can use exists: there is no `Image` entity in the motion package, so images are unreachable from scenes, the player, and the docs. The fonts pipeline (annotation → session load → paint-by-name with soft skips) is the proven template; images follow it with less machinery because pictures are session-owned paints, not entries in an engine-global table — no refcounts, conflicts, or tombstones.

## What Changes

- **`Images` annotation module** in `effect-motion` (mirror of `Fonts.ts`): `ImageResource { name, src: { url?, path? } }`, a `scene.annotate` key the runtime never reads, plus accessors (`get`, `urlMap`). Frame production is unchanged by the annotation (determinism invariant).
- **`Shapes.Image` entity**: `image` (asset name, required), `x`/`y`/`z`, `opacity`, and *optional, undefaulted* `width`/`height` — set, the picture draws at exactly that size (numeric, tweenable; implemented as per-axis scale in the projection transform, since the engine's `setSize` preserves aspect); absent, the picture renders at its decoded natural size. Standard position/opacity trait lenses. Billboard-only in v1 (no orientation fields; a projective-transform tilt path is a recorded ceiling, not scope).
- **Session-held pictures**: `Session.make` gains `images?: Record<name, url>` — decoded once at session open into a `name → picture paint` map owned by the session scope, released on close. Failed fetch/decode is a logged skip (fonts semantics). Per-frame, the renderer duplicates the cached picture and adds the duplicate to the frame subtree (paint-tier, freed per frame).
- **Renderer paint fn** for `shapes/Image`: look up the session picture by name, soft-skip when absent, duplicate → projection transform (with per-axis declared-size scale folded in) → add.
- **Player/exporter wiring**: the per-mount session already exists; it additionally passes `Images.urlMap(scene)`. Session open awaits image settlement, so readiness gates on images the same way it gates on fonts.
- **Docs**: an images example scene + registry entry and a Going Further page shaped like fonts.mdx.
- Spike-first (same pattern as the keeper spike): verify `Picture` duplicate cost/sharing and that pictures honor `set_transform` under a nested scene (Text does not — the quirk must be ruled out before the paint-fn design is trusted).

## Capabilities

### New Capabilities

- `image-assets`: scene-level image declaration (annotation), the `Shapes.Image` entity, session-held decoded pictures, and the render path with soft-skip semantics.

### Modified Capabilities

- `thorvg-images`: reword "Picture data is paint-tier" — per-frame duplicates are paint-tier; a render session MAY hold source pictures through its scope (they are still scope-owned paints, released on session close).
- `thorvg-runtime`: "Render session bundles canvas and fonts" widens to canvas, fonts, and images.

## Impact

- `packages/motion`: new `Images.ts`, new `shapes/Image.ts`, paint fn in `render/shapes.ts` (+ `builtinPaints` entry — the exhaustive coverage map makes this a type error until added).
- `packages/thorvg`: `Session.ts` gains image loading/holding; possibly a small `Picture` addition if the spike prefers `ref`-based reuse over `duplicate`.
- `packages/react`: `Player.tsx` session options gain `Images.urlMap(scene)` (one line next to fonts).
- `apps/docs`: example scene, registry entry, content page.
- Tests: thorvg session-image tests; motion framebuffer test for the paint path; spike test for duplicate/transform behavior.
- No new dependencies. `src.path` is reserved (url-only loading, exactly like fonts).
