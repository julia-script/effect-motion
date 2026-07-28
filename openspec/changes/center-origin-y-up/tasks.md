# Tasks: center-origin-y-up

## 1. Core math (packages/motion)

- [x] 1.1 Rewrite the Vec3 / coordinate docs in `Entity.ts` (and any other TSDoc mentioning y-down or top-left) to the new frame: x right, y up, center origin, +z toward viewer, CCW-positive rotation
- [x] 1.2 Drop the `origin` parameter from `Projection.project` / `toView` / `resolveCamera` (center origin makes it always zero); update `Camera.ts` call sites to shed their `width / 2` compositions
- [x] 1.3 Re-derive `lookAtOrientation` signs for the right-handed frame (do not blind-negate); keep the POI-projects-to-viewport-center tests as the pin, updating expectations to the new frame
- [x] 1.4 Re-derive orbit azimuth in `Camera.ts` so the documented behavior (azimuth 0 at +z of the POI, POI stays centered) holds in the new frame; pin visual direction with a projected-position test
- [x] 1.5 `pnpm --filter effect-motion exec vitest run test/projection*` (or equivalent) green before moving on

## 2. Renderer (packages/renderer)

- [x] 2.1 Make `ctx.toThree` the identity (keep the named seam), remove camera sync negations in `Sync.ts` (`syncCameras`), and update the coordinate-space comments (`Sync.ts:79`, `EntityRenderer.ts`)
- [x] 2.2 Remove the object-rotation conjugation in `Builtins.ts` (rect tilt path): `rotation.set(rotX, rotY, rotZ)`, order "ZYX" retained
- [x] 2.3 Center the shared `unitPlane` (drop the `translate(0.5, -0.5, 0)`) and recenter `rectPoints` outline geometry to ±w/2, ±h/2 — Rect/Square/Image become center-anchored; verify rotation-about-center falls out
- [x] 2.4 Center-anchor sub-composition composite planes in `Sync.ts` (comp placement + the 2D-affine conjugation comment); HUD tier confirmed center-origin y-up via the identity camera
- [x] 2.5 Text: flip glyph-quad placement once at the font-metric boundary (`Text.ts`), keep baseline-left anchor semantics and downward visual line stacking; add/adjust a test with an asymmetric multi-line layout so a stray double-flip cannot cancel
- [x] 2.6 Verify image UV orientation with an asymmetric-image test; confirm pixel readback (Node PNG path) needs no change
- [x] 2.7 Grep the renderer for residual `-y` / negation compensations near the seams; each surviving flip carries a boundary comment (design D7)

## 3. Particles

- [x] 3.1 Gravity integrates toward −y (`vy -= gravity * dt` in `particles/step.ts`); launch angle 0 = up (+y), CCW-positive; update the doc comments in `Particle.ts` / `constructors.ts`
- [x] 3.2 Fill emission: default whole-frame region becomes signed bounds (x ∈ [−w/2, w/2], y ∈ [−h/2, h/2]); adjust wrap logic
- [x] 3.3 Confirm the RNG draw sequence is untouched (seeded-stream test stays green with re-derived positional expectations)

## 4. Tests

- [x] 4.1 Update `packages/motion/test` coordinate expectations file-by-file, re-deriving each value from the new frame (no mass sign-flipping)
- [x] 4.2 Update `packages/renderer/test` the same way, including anchor-sensitive cases (rect bounds, outline points, comp placement)
- [x] 4.3 `pnpm check && pnpm test` green across the workspace

## 5. Docs examples (best-effort)

- [x] 5.1 Migrate the 34 `apps/docs/examples/*.scene.ts` with the mechanical rules (`x' = x − w/2`, `y' = h/2 − y`, `rotZ' = −rotZ`, anchor shift for rects/images), preferring round centered values over exact transliteration
- [x] 5.2 Visual spot-check every example in the docs/studio preview; fix what reads wrong
- [x] 5.3 Correct MDX prose only where it sits next to a fixed example and states the old convention (full docs rewrite is out of scope)

## 6. Wrap-up

- [x] 6.1 Update `AGENTS.md` / `CLAUDE.md` convention notes that state y-down or top-left
- [x] 6.2 Changeset: major-intent breaking change notes for `effect-motion` and `@effect-motion/renderer` (pre-1.0 minor bumps)
- [x] 6.3 `openspec validate --change center-origin-y-up` and final full-suite run
