# Tasks: image-assets

## 1. Spike: picture duplicate + nested-scene transform

- [x] 1.1 Vitest in `packages/thorvg`: load one picture, `Paint.duplicate` it N times, add duplicates to a scene, render — assert correctness and eyeball timing to judge whether duplicate deep-copies pixels. If duplicate is prohibitively expensive, record it in design.md and switch D2 to the `_tvg_paint_ref` fallback before proceeding.
- [x] 1.2 Same spike: picture inside a nested scene positioned via `Paint.setTransform` (non-identity affine) — assert pixels land where the affine says (rules out the Text nested-scene transform quirk). If the quirk exists, record it and use the translate/setSize workaround in the paint fn.

## 2. thorvg session images

- [x] 2.1 `Session.ts`: `SessionOptions.images?: Record<string, string>`; fetch+decode at open (concurrent, logged skip per failed entry naming asset and source), expose `pictures: ReadonlyMap<string, OwnedPaint>` on `RenderSessionShape`; pictures freed by the session scope.
- [x] 2.2 Tests: decode-once per session (fetch counter), bad-URL logged skip with session opening, pictures freed on close (Embind throws after delete via a duplicate probe), two sessions loading different sources under the same name don't interact.

## 3. Motion: annotation + entity + paint

- [x] 3.1 `Images.ts` in `packages/motion` mirroring `Fonts.ts`: `ImageResource`, annotation key, `get`, `urlMap`; unit tests incl. frames-unchanged-by-annotation.
- [x] 3.2 `shapes/Image.ts`: `image` required, optional undefaulted `width`/`height`, standard position/opacity lenses, no orientation fields; export from `shapes/index.ts`.
- [x] 3.3 Paint fn in `render/shapes.ts` + `builtinPaints` entry: look up session picture by name (soft-skip when absent), duplicate, both-dimensions-set → `Picture.setSize` (lone dimension ignored), opacity, projection transform per spike outcome, add to scene. `ponytail:` note the billboard-only ceiling and the projective-transform upgrade path. *(Deviation: sizing folds per-axis scale into the transform instead of `setSize` — setSize preserves aspect, probe-verified; recorded in design D3.)*
- [x] 3.4 Framebuffer tests (test/support/framebuffer.ts path): image renders at declared size and at natural size; missing asset paints nothing while siblings render; opacity applies.

## 4. Player + exporters

- [x] 4.1 `Player.tsx`: pass `Images.urlMap(scene)` into the per-mount session options (next to fonts).
- [x] 4.2 `demo.ts` / exporter session call sites: accept images the same way (only where a session is opened; exporters consume framebuffers and need no change beyond options plumbing).

## 5. Docs

- [x] 5.1 `apps/docs/examples/images.scene.ts` + registry entry: a scene declaring an image (CORS-open URL), placing/tweening it alongside text.
- [x] 5.2 `content/docs/going-further/images.mdx` shaped like fonts.mdx: declaration model, sizing semantics (declared vs natural), failure semantics, url-only note.

## 6. Wrap up

- [x] 6.1 `pnpm lint:fix`; typecheck + tests across thorvg/motion/react with no NEW failures (pre-existing baseline: Schedule API, particles branding, export package); docs example verified rendering in the browser. *(thorvg 38/38, motion 218 pass + the 8 pre-existing, react tsc clean; rocket example rendered and tweened live on /docs/going-further/images.)*
- [x] 6.2 Sync check: delta specs for `thorvg-images`/`thorvg-runtime` match what shipped; stale-comment sweep.
