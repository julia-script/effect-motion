# Tasks: add-font-loading

## 1. Core declaration

- [x] 1.1 Add `packages/motion/src/Fonts.ts`: `FontResource` type, the `Fonts` annotation key, and the accessor returning `[]` for unannotated scenes; export from the package index
- [x] 1.2 Test: annotate a scene, read the declaration back; unannotated scene reads `[]`; annotated and unannotated runs of the same scene produce identical frames

## 2. Player loading

- [x] 2.1 In `usePlayer`, read the scene's fonts annotation and load url entries via `FontFace`/`document.fonts` concurrently with initial buffering; hold `status` at `'loading'` until loads settle; failures warn and proceed; path-only entries skipped
- [x] 2.2 Test: ready is gated on font settlement, a rejecting load still reaches `'ready'`, path-only entries attempt no load (stub `document.fonts`)

## 3. Export mapping

- [x] 3.1 Add the fonts→resvg helper in `@effect-motion/export`: path entries become `fontFiles`, url-only entries skipped, `loadSystemFonts` untouched
- [x] 3.2 Test: options mapping (paths in, urls skipped), plus one end-to-end rasterization with a real font file proving the declared family renders

## 4. Docs

- [x] 4.1 Document font declaration and the two consumer paths (player url, export path) wherever text/export docs live in the docs site
