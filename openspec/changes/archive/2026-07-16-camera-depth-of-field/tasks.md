# Tasks: camera-depth-of-field

## 1. Spike: gaussian blur on nested scenes (design D4)

- [x] 1.1 Vitest in `packages/thorvg`: nested scene with `addGaussianBlur` under a root scene alongside unblurred siblings — assert the subtree blurs and the siblings stay sharp (pixel checks with a background rect; SW targets are uninitialized). Verify `direction`/`border`/`quality` semantics against rendered output; hard-code or name the right values at the call site.
- [x] 1.2 Same spike: time one blur pass at 500×300 and 875×525 (player dpr size) for small and large sigma; record numbers in design.md D4 and set the docs' cost guidance from them.
- [x] 1.3 Same spike: translate-positioned text inside a blur bucket inside the root (two scene levels) — if it vanishes, record it and pin text paints to root-level sharp runs (documented: text never blurs).

## 2. Camera fields

- [x] 2.1 `Camera.ts`: `focusDistance`/`aperture` optionalKey numerics; Runner fills `focusDistance` with the resting distance at instantiate (beside the existing `z`/`focalLength` fill) and `aperture` with 0; `Camera.identity` carries both; `CameraState`/`Projection.CameraView` gain the fields.
- [x] 2.2 Tests: defaults (untouched camera → focus at resting distance, aperture 0), fields tween like any numeric, `FrameMeta.camera` carries them.

## 3. CoC + bucketed rendering

- [x] 3.1 CoC function in the render layer (D2 formula, max-sigma clamp, quantization to 0.5px steps with a sharp threshold) — pure, unit-tested numerically (zero at focus plane, monotone, clamped).
- [x] 3.2 `Renderer.ts` paint loop: with `aperture > 0`, group contiguous quantized-sigma runs into blur-wrapped nested scenes added to the root in order; sharp runs and the whole `aperture === 0` path structurally unchanged. Respect the spike's text placement rule if 1.3 found the quirk.
- [x] 3.3 Framebuffer tests: aperture 0 byte-identical to today; focus-plane shape sharp while off-plane shape blurs; farther-from-focus blurs more; overlapping blurred/sharp/blurred paint order preserved; determinism (same frame twice → identical buffers).

## 4. Docs

- [x] 4.1 `apps/docs/examples/rack-focus.scene.ts` + registry: shapes at three depths, camera tweening `focusDistance` between them (aperture set once).
- [x] 4.2 Camera docs section (or a small DoF page): the two fields, defaults/off semantics, cost guidance from the spike numbers, and the documented approximations (per-paintable sigma, text rule if any).

## 5. Wrap up

- [x] 5.1 `pnpm lint:fix`; typecheck + tests across packages with no NEW failures (baseline: Schedule API, particles branding, export package); example verified in the browser. *(thorvg 41/41, motion 228 pass + the 8 pre-existing, react clean. Example verified playing on /docs/concepts/camera via canvas pixel readback + zero console errors — the browser pane screenshot compositor wedged mid-session, so proof is numeric; the rigorous blur assertions live in the deterministic framebuffer tests.)*
- [x] 5.2 Sync check on the `camera-3d` delta vs what shipped; sweep for stale comments; `ponytail:` the per-paintable-exact-sigma upgrade path at the quantization site.
