# Camera depth of field: focusDistance + aperture, blur-bucketed rendering

## Why

The camera can move, rotate, and zoom in 3D, but everything renders pin-sharp regardless of depth — there is no way to direct attention with focus, and rack-focus (a staple motion-graphics move) is inexpressible. All the pieces already exist and line up: the camera is an animatable entity (new fields tween for free), every paintable carries its view-space `depth` from projection, and the thorvg package already wraps ThorVG's gaussian-blur scene effect with zero callers.

## What Changes

- **Camera fields**: `focusDistance` (view-space distance to the sharp plane; defaults to the resting camera distance so the z=0 plane is in focus untouched — Runner-filled, like `z`/`focalLength`) and `aperture` (blur strength; **default 0 = pinhole = DoF off**, an explicit opt-in per the repo's effect-faithful-defaults stance). Both plain numerics: `camera.pipe(Motion.tweenTo({ focusDistance: 400 }, "1 second"))` is a rack-focus with no new animation machinery.
- **Circle-of-confusion function** in the projection/render layer: a pure function `sigma(depth, camera)` — zero at the focus plane, growing with `|depth − focusDistance|`, scaled by `aperture`; AE-flavored formula pinned in design.md. Deterministic (pure arithmetic on frame data).
- **Blur-bucketed rendering**: with `aperture > 0`, the renderer walks its existing depth-sorted paint list and groups contiguous runs of equal *quantized* sigma into nested scenes wrapped with `Scene.addGaussianBlur`; sharp runs paint into the root as today. Contiguous runs preserve painter's order exactly; quantization keeps the pass count small (typically 2–5). With `aperture === 0` (every existing scene) the bucket path is skipped entirely — zero cost, byte-identical output.
- **Spike-first** (the engine has produced three verified quirks so far): blur-on-nested-scene correctness and per-pass cost on the SW renderer; text rendering two scene levels deep (it already has the one-level transform quirk); blur `border`/`direction`/`quality` parameter semantics.
- **Docs**: a rack-focus example scene + a section on the camera page (or a small DoF page).
- Known, documented approximations: one sigma per paintable (a ParticleField or a tilted quad spanning depth gets its anchor's blur), and DoF is a ThorVG-renderer feature (no SVG-sink equivalent) — same class as fonts/images.

## Capabilities

### New Capabilities

- `depth-of-field`: the camera focus fields, the CoC function, blur-bucketed rendering, and the opt-in/off semantics.

### Modified Capabilities

- `camera-3d`: the "3D camera as an animatable instance" requirement gains the two focus fields and their defaults (focus at the z=0 plane, aperture 0 = off).

## Impact

- `packages/motion`: `Camera.ts` (fields + Runner fill for `focusDistance`), `Projection.ts` or `render/` (CoC function), `Renderer.ts` (bucket grouping in the paint loop — the only structural change).
- `packages/thorvg`: none expected (`Scene.addGaussianBlur` exists); possibly constants for `direction`/`border`/`quality` if the spike shows raw numbers are error-prone.
- `apps/docs`: example + content.
- Tests: spike (blur cost/correctness, text nesting), framebuffer tests (focus plane sharp / off-plane blurred / aperture 0 byte-identical), camera field defaults.
- No dependency changes. Player performance is author-owned in v1: opting into DoF costs what the blur passes cost (spike quantifies it; a quality knob is the recorded upgrade path if needed).
